"""
DEPRECATED/UNUSED SCRIPT

This script has been quarantined under Nouse because it is not used by the
current GAS app runtime. To prevent accidental execution or import, it exits
immediately. If you truly need it, move it back after code review and remove
this guard.
"""

import sys as _sys
_sys.exit("[Nouse] daily_update.py is deprecated and must not be used.")

import os
import json
import re
import io
import gspread
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

# --- 設定 ---
# 要件定義書で指定された正しいマスターシートID
SPREADSHEET_ID = '1EkTjV__k1vAl08PlbOUhYpbFEGC-F_LL_26o1-HT1AI'
SHEET_NAME = 'master'
LOCAL_IMAGE_DIR = 'images/_lensimage'

# スプレッドシートの列設定
COL_PRODUCT_CODE = 7
COL_SERIES = 9
COL_COLOR = 10
COL_WEAR_PERIOD = 11
COL_IMG_URL = 24

# --- スクリプト本体 ---

def get_google_credentials():
    """環境変数からGoogle認証情報を読み込みます。"""
    creds_json_str = os.getenv('GOOGLE_CREDENTIALS')
    if not creds_json_str:
        raise ValueError("環境変数 'GOOGLE_CREDENTIALS' が設定されていません。")
    
    creds_info = json.loads(creds_json_str)
    scopes = [
        'https://www.googleapis.com/auth/spreadsheets.readonly', # 読み取り専用
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
    name = name.replace('　', ' ')
    return re.sub(r'[\/:*?"<>|]', '_', name)

def download_image_from_drive(service, file_id, save_path):
    """Google Driveからファイルをダウンロードして保存します。"""
    request = service.files().get_media(fileId=file_id)
    fh = io.BytesIO()
    downloader = MediaIoBaseDownload(fh, request)
    
    done = False
    while not done:
        status, done = downloader.next_chunk()
        print(f"  > ダウンロード中: {save_path} ({int(status.progress() * 100)}%)")

    with open(save_path, 'wb') as f:
        f.write(fh.getvalue())
    print(f"  > 保存完了: {save_path}")

def main():
    """メイン処理: スプレッドシートを読み取り、Google Driveから画像をダウンロードしてローカルに保存する"""
    print("--- 画像ダウンロードスクリプト開始 ---")

    try:
        creds = get_google_credentials()
        gc = gspread.authorize(creds)
        drive_service = get_drive_service(creds)

        os.makedirs(LOCAL_IMAGE_DIR, exist_ok=True)

        print(f"スプレッドシート(ID: {SPREADSHEET_ID})を開いています...")
        worksheet = gc.open_by_key(SPREADSHEET_ID).worksheet(SHEET_NAME)
        records = worksheet.get_all_values()[2:] # 3行目からデータ取得

        print(f"{len(records)}行のデータを処理します。")
        download_count = 0
        for i, row in enumerate(records):
            row_num = i + 3
            
            if not row or len(row) < COL_IMG_URL:
                continue

            series = row[COL_SERIES - 1].strip()
            color = row[COL_COLOR - 1].strip()
            url_cell_value = row[COL_IMG_URL - 1].strip()

            if not series or not color or 'drive.google.com' not in url_cell_value:
                continue

            print(f"処理中: {row_num}行目 - {series}｜{color}")
            
            file_id = extract_drive_file_id(url_cell_value)
            if not file_id:
                print(f"  - 警告: 有効なGoogle Driveリンクではありません。スキップします。")
                continue
            
            try:
                product_code = row[COL_PRODUCT_CODE - 1].strip()
                wear_period = row[COL_WEAR_PERIOD - 1].strip()
                filename = f"{product_code}_{sanitize_filename(series)}_{sanitize_filename(color)}_{sanitize_filename(wear_period)}_lens.jpg"
                save_path = os.path.join(LOCAL_IMAGE_DIR, filename)

                # ローカルに同じファイルがなければダウンロード
                if not os.path.exists(save_path):
                    download_image_from_drive(drive_service, file_id, save_path)
                    download_count += 1
                else:
                    print(f"  - スキップ: {filename} は既に存在します。")

            except Exception as e:
                print(f"  - エラー: {row_num}行目の処理中にエラーが発生しました: {e}")
        
        print(f"\n{download_count}件の新しい画像をダウンロードしました。")
        print("--- スクリプト正常終了 ---")

    except Exception as e:
        print(f"致命的なエラーが発生しました: {e}")
        exit(1)

if __name__ == '__main__':
    main()
