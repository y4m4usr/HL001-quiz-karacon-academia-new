
import os
import json
import gspread
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
import re

# --- ユーザー設定 (ここを編集してください) ---

# 1. Google Driveに画像をアップロードするためのフォルダを作成し、そのフォルダのIDをここに貼り付けます。
#    フォルダIDは、URLの `folders/` の後ろにある文字列です。
#    例: https://drive.google.com/drive/folders/1a2b3c4d5e6f7g8h9i0j
DRIVE_FOLDER_ID = '1-fkwMAiO8ewSXXh6IkMZg2DdnzL39feA' # ← ここにIDを貼り付け

# 2. スプレッドシートと画像フォルダのパス (通常は変更不要)
SPREADSHEET_ID = '12dYxk29Tj4Xv4E_VDdXnCPclQK72XZrSabdhi2SM_0Y'
SHEET_NAME = 'master'
LOCAL_IMAGE_DIR = 'images/_lensimage'

# 3. スプレッドシートの列設定 (通常は変更不要)
#    `code.gs` の設定と一致させます。
#    SERIES: I列(9), COLOR: J列(10), IMG: X列(24)
COL_SERIES = 9
COL_COLOR = 10
COL_IMG = 24

# --- スクリプト本体 (ここから下は編集不要) ---

def get_google_credentials():
    """環境変数からGoogle認証情報を読み込みます。"""
    creds_json_str = os.getenv('GOOGLE_CREDENTIALS')
    if not creds_json_str:
        raise ValueError("環境変数 'GOOGLE_CREDENTIALS' が設定されていません。")
    
    scopes = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ]
    return Credentials.from_service_account_info(
        json.loads(creds_json_str), scopes=scopes
    )

def get_drive_files(service, folder_id):
    """指定されたGoogle Driveフォルダ内のファイル一覧を名前をキーにして取得します。"""
    print(f"Google Driveフォルダ(ID: {folder_id})内のファイルを取得中...")
    results = service.files().list(
        q=f"'{folder_id}' in parents and trashed=false",
        fields="files(id, name, webViewLink)"
    ).execute()
    files = results.get('files', [])
    print(f"{len(files)}個のファイルが見つかりました。")
    return {f['name']: {'id': f['id'], 'url': f['webViewLink']} for f in files}

def upload_to_drive(service, folder_id, local_path, filename):
    """ファイルをGoogle Driveにアップロードします。"""
    print(f"  > アップロード中: {filename}")
    file_metadata = {'name': filename, 'parents': [folder_id]}
    media = MediaFileUpload(local_path, mimetype='image/jpeg') # mimetypeは適宜変更
    file = service.files().create(
        body=file_metadata,
        media_body=media,
        fields='id, webViewLink'
    ).execute()
    print(f"  > アップロード完了 (ID: {file.get('id')})")
    return {'id': file.get('id'), 'url': file.get('webViewLink')}

def parse_filename(filename):
    """ファイル名からシートのキーを生成します (例: 0002_アイクローゼット_ちびこっぺぱん.jpg -> アイクローゼット｜ちびこっぺぱん)"""
    match = re.match(r"\d+_(.+)_(.+)\.jpg", filename, re.IGNORECASE)
    if match:
        part1 = match.group(1)
        part2 = match.group(2)
        return f"{part1}｜{part2}"
    return None

def main():
    """メイン処理"""
    print("--- 画像同期スクリプト開始 ---")

    if DRIVE_FOLDER_ID == 'YOUR_GOOGLE_DRIVE_FOLDER_ID':
        print("エラー: スクリプト内の `DRIVE_FOLDER_ID` を設定してください。")
        return

    try:
        # 認証
        creds = get_google_credentials()
        drive_service = build('drive', 'v3', credentials=creds)
        gc = gspread.authorize(creds)

        # 1. Drive上の既存ファイルを取得
        drive_files = get_drive_files(drive_service, DRIVE_FOLDER_ID)

        # 2. ローカルの画像ファイルを取得
        local_files = os.listdir(LOCAL_IMAGE_DIR)
        print(f"ローカルの`{LOCAL_IMAGE_DIR}`フォルダに{len(local_files)}個の画像があります。")

        # 3. ローカルとDriveを比較し、なければアップロード
        drive_url_map = {f: drive_files[f]['url'] for f in drive_files}
        for filename in local_files:
            if not filename.lower().endswith('.jpg'):
                continue
            
            if filename not in drive_files:
                local_path = os.path.join(LOCAL_IMAGE_DIR, filename)
                new_file = upload_to_drive(drive_service, DRIVE_FOLDER_ID, local_path, filename)
                drive_url_map[filename] = new_file['url']

        # 4. スプレッドシートを更新
        print("スプレッドシートを更新中...")
        worksheet = gc.open_by_key(SPREADSHEET_ID).worksheet(SHEET_NAME)
        
        # ヘッダーを除いて3行目から取得
        records = worksheet.get_all_values()[2:] 
        
        updates = []
        for i, row in enumerate(records):
            # 行が空、またはSERIES, COLOR列が空ならスキップ
            if not row or (len(row) < COL_COLOR):
                continue

            series = row[COL_SERIES - 1]
            color = row[COL_COLOR - 1]
            
            if not series or not color:
                continue

            sheet_key = f"{series}｜{color}"
            current_url = row[COL_IMG - 1] if len(row) >= COL_IMG else ''

            # 対応するファイル名を探す
            found_filename = None
            for filename in drive_url_map:
                if parse_filename(filename) == sheet_key:
                    found_filename = filename
                    break
            
            if found_filename:
                new_url = drive_url_map[found_filename]
                if new_url != current_url:
                    # gspread.cell.Cell オブジェクトを作成して更新リストに追加
                    cell_to_update = gspread.cell.Cell(row=i + 3, col=COL_IMG, value=new_url)
                    updates.append(cell_to_update)
                    print(f"  - 更新: {sheet_key} (行: {i+3})")

        if updates:
            worksheet.update_cells(updates, value_input_option='USER_ENTERED')
            print(f"{len(updates)}件の画像URLを更新しました。")
        else:
            print("スプレッドシートの更新は不要でした。")

        print("--- スクリプト正常終了 ---")

    except Exception as e:
        print(f"エラーが発生しました: {e}")
        # エラーで終了した場合、0以外のコードを返す
        exit(1)

if __name__ == '__main__':
    main()
