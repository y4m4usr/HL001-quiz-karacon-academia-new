import os
import json
import gspread
from google.oauth2.service_account import Credentials
import re

# --- ユーザー設定 ---
# GitHubリポジトリ情報 (user/repo)
GITHUB_OWNER_REPO = 'y4m4usr/HL001-quiz-karacon-academia-new'
GITHUB_BRANCH = 'main'

# スプレッドシート情報 (通常は変更不要)
SPREADSHEET_ID = '12dYxk29Tj4Xv4E_VDdXnCPclQK72XZrSabdhi2SM_0Y'
SHEET_NAME = 'master'
LOCAL_IMAGE_DIR = 'images/_lensimage'

# スプレッドシートの列設定 (通常は変更不要)
COL_SERIES = 9
COL_COLOR = 10
COL_IMG = 24

# --- スクリプト本体 (ここから下は編集不要) ---

def get_google_credentials():
    """環境変数からGoogle認証情報を読み込みます。"""
    creds_json_str = os.getenv('GOOGLE_CREDENTIALS')
    if not creds_json_str:
        raise ValueError("環境変数 'GOOGLE_CREDENTIALS' が設定されていません。")
    
    scopes = ['https://www.googleapis.com/auth/spreadsheets']
    return Credentials.from_service_account_info(
        json.loads(creds_json_str), scopes=scopes
    )

def get_github_raw_url(owner_repo, branch, image_path):
    """GitHubのRaw URLを生成します。"""
    # Windowsのパス区切り文字(\)をURLの(/)に変換
    image_path = image_path.replace('\\', '/')
    return f"https://raw.githubusercontent.com/{owner_repo}/{branch}/{image_path}"

def parse_filename_to_key(filename):
    """ファイル名からシートのキーを生成します (例: 0002_アイクローゼット_ちびこっぺぱん.jpg -> アイクローゼット｜ちびこっぺぱん)"""
    # 拡張子を取り除く
    name_without_ext = os.path.splitext(filename)[0]
    # 数字とアンダースコアで始まる部分を削除
    parts = name_without_ext.split('_', 1)
    if len(parts) < 2:
        return None
    
    # ブランド名とカラー名に分割
    key_parts = parts[1].split('_', 1)
    if len(key_parts) < 2:
        return None
        
    return f"{key_parts[0]}｜{key_parts[1]}"

def main():
    """メイン処理"""
    print("--- スプレッドシート更新スクリプト開始 (GitHub URLモード) ---")

    try:
        # 1. 認証
        creds = get_google_credentials()
        gc = gspread.authorize(creds)

        # 2. ローカル画像から「シートのキー -> GitHub URL」のマップを作成
        print(f"ローカルの`{LOCAL_IMAGE_DIR}`フォルダをスキャン中...")
        local_files = os.listdir(LOCAL_IMAGE_DIR)
        key_to_url_map = {}
        for filename in local_files:
            if not filename.lower().endswith('.jpg'):
                continue
            
            sheet_key = parse_filename_to_key(filename)
            if sheet_key:
                full_path = os.path.join(LOCAL_IMAGE_DIR, filename)
                github_url = get_github_raw_url(GITHUB_OWNER_REPO, GITHUB_BRANCH, full_path)
                key_to_url_map[sheet_key] = github_url
        print(f"{len(key_to_url_map)}件の画像キーとURLのマップを作成しました。")

        # 3. スプレッドシートを更新
        print("スプレッドシートを更新中...")
        worksheet = gc.open_by_key(SPREADSHEET_ID).worksheet(SHEET_NAME)
        
        records = worksheet.get_all_values()[2:] # ヘッダーを除いて3行目から取得
        
        updates = []
        for i, row in enumerate(records):
            if not row or len(row) < COL_COLOR:
                continue

            series = row[COL_SERIES - 1]
            color = row[COL_COLOR - 1]
            
            if not series or not color:
                continue

            sheet_key = f"{series}｜{color}"
            current_url = row[COL_IMG - 1] if len(row) >= COL_IMG else ''

            if sheet_key in key_to_url_map:
                new_url = key_to_url_map[sheet_key]
                if new_url != current_url:
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
        exit(1)

if __name__ == '__main__':
    main()
