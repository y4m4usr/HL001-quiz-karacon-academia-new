import os
import json
import re
import io
import gspread
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

# --- ユーザー設定 ---
GITHUB_OWNER_REPO = 'y4m4usr/HL001-quiz-karacon-academia-new'
GITHUB_BRANCH = 'main'
SPREADSHEET_ID = '12dYxk29Tj4Xv4E_VDdXnCPclQK72XZrSabdhi2SM_0Y'
SHEET_NAME = 'master'
LOCAL_IMAGE_DIR = 'images/_lensimage'

# スプレッドシートの列設定
COL_SERIES = 9
COL_COLOR = 10
COL_IMG_URL = 24 # Google Drive URLの読み取り元であり、GitHub URLの書き込み先

# --- スクリプト本体 ---

def get_google_credentials():
    """環境変数からGoogle認証情報を読み込み、必要なスコープを設定します。"""
    creds_json_str = os.getenv('GOOGLE_CREDENTIALS')
    if not creds_json_str:
        raise ValueError("環境変数 'GOOGLE_CREDENTIALS' が設定されていません。")
    
    creds_info = json.loads(creds_json_str)
    
    # スプレッドシートとGoogle Driveの両方のスコープを追加
    scopes = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.readonly'
    ]
    
    return Credentials.from_service_account_info(creds_info, scopes=scopes)

def get_drive_service(creds):
    """Google Drive APIサービスを構築します。"""
    return build('drive', 'v3', credentials=creds)

def extract_drive_file_id(url):
    """Google Driveの共有URLからファイルIDを抽出します。"""
    match = re.search(r'/file/d/([a-zA-Z0-9_-]+)', url)
    if match:
        return match.group(1)
    return None

def sanitize_filename(name):
    """安全なファイル名を生成します。"""
    # 全角スペースを半角スペースに
    name = name.replace('　', ' ')
    # 不許可文字をアンダースコアに置換
    return re.sub(r'[\/:*?"<>|]', '_', name)

def download_image_from_drive(service, file_id, save_path):
    """Google Driveからファイルをダウンロードして保存します。"""
    request = service.files().get_media(fileId=file_id)
    fh = io.BytesIO()
    downloader = MediaIoBaseDownload(fh, request)
    
    done = False
    while not done:
        status, done = downloader.next_chunk()
        print(f"  > ダウンロード中: {int(status.progress() * 100)}%")

    with open(save_path, 'wb') as f:
        f.write(fh.getvalue())
    print(f"  > 保存完了: {save_path}")

def get_github_raw_url(owner_repo, branch, image_path):
    """GitHubのRaw URLを生成します。"""
    image_path = image_path.replace('\\', '/')
    return f"https://raw.githubusercontent.com/{owner_repo}/{branch}/{image_path}"

def main():
    """メイン処理"""
    print("--- スプレッドシート更新スクリプト開始 (Google Drive連携モード) ---")

    try:
        # 1. 認証とサービス準備
        creds = get_google_credentials()
        gc = gspread.authorize(creds)
        drive_service = get_drive_service(creds)

        # 2. ローカルの画像保存ディレクトリを作成
        os.makedirs(LOCAL_IMAGE_DIR, exist_ok=True)

        # 3. スプレッドシートを開いて全データを取得
        print("スプレッドシートからデータを取得中...")
        worksheet = gc.open_by_key(SPREADSHEET_ID).worksheet(SHEET_NAME)
        records = worksheet.get_all_values()
        header = records[1] # 2行目をヘッダーとする
        data_rows = records[2:] # 3行目からデータ

        updates = []
        
        # 4. 各行を処理
        for i, row in enumerate(data_rows):
            row_num = i + 3 # スプレッドシートの行番号 (3から始まる)
            
            if not row or len(row) < COL_IMG_URL:
                continue

            series = row[COL_SERIES - 1].strip()
            color = row[COL_COLOR - 1].strip()
            url_cell_value = row[COL_IMG_URL - 1].strip()

            if not series or not color or not url_cell_value:
                continue

            # 5. URLがGoogle Driveのものかチェック
            if 'drive.google.com' in url_cell_value:
                print(f"処理中: {row_num}行目 - {series}｜{color}")
                
                file_id = extract_drive_file_id(url_cell_value)
                if not file_id:
                    print(f"  - 警告: 有効なGoogle DriveファイルIDが見つかりません。スキップします。")
                    continue
                
                try:
                    # 6. 画像をダウンロード
                    # ファイル名を「シリーズ_カラー.jpg」で統一
                    sanitized_series = sanitize_filename(series)
                    sanitized_color = sanitize_filename(color)
                    filename = f"{sanitized_series}_{sanitized_color}.jpg"
                    save_path = os.path.join(LOCAL_IMAGE_DIR, filename)
                    
                    download_image_from_drive(drive_service, file_id, save_path)

                    # 7. GitHubのURLを生成し、更新リストに追加
                    new_github_url = get_github_raw_url(GITHUB_OWNER_REPO, GITHUB_BRANCH, save_path)
                    
                    if new_github_url != url_cell_value:
                        cell_to_update = gspread.cell.Cell(row=row_num, col=COL_IMG_URL, value=new_github_url)
                        updates.append(cell_to_update)
                        print(f"  - URLを更新: {new_github_url}")
                    else:
                        print("  - URLは既に最新です。")

                except Exception as e:
                    print(f"  - エラー: {row_num}行目の処理中にエラーが発生しました: {e}")
        
        # 8. スプレッドシートを一括更新
        if updates:
            print(f"\n{len(updates)}件の画像URLをスプレッドシートに反映します...")
            worksheet.update_cells(updates, value_input_option='USER_ENTERED')
            print("更新が完了しました。")
        else:
            print("\nスプレッドシートの更新は不要でした。")

        print("--- スクリプト正常終了 ---")

    except Exception as e:
        print(f"エラーが発生しました: {e}")
        exit(1)

if __name__ == '__main__':
    main()