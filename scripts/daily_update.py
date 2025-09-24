#!/usr/bin/env python3
# -*- coding: utf-8 -*- 

"""
HL001 Strict Daily Update
- v1.8 準拠：X=レンズ、W=サムネ／K(装用期間)は命名必須／合致しない素材は非採用
- Drive→検証→シャード配置→manifest生成→コミット→PR→レポート
"""

import os, re, io, sys, json, csv, shutil, hashlib, subprocess, textwrap, time, unicodedata
from pathlib import Path
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import requests
from PIL import Image

import gspread
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build as gapi_build
from googleapiclient.http import MediaIoBaseDownload

# ========== CONFIG ========== 
# --- 環境変数（CI用） ---
GOOGLE_CREDENTIALS = os.environ.get('GOOGLE_CREDENTIALS', '')  # サービスアカウントJSON文字列
GITHUB_TOKEN       = os.environ.get('GITHUB_TOKEN', '')
DRY_RUN            = os.environ.get('DRY_RUN', '0') == '1'
STRICT_MODE        = True   # 変更しない（unknown等を作らない）

# --- スプレッドシート ---
SPREADSHEET_ID   = '1EkTjV__k1vAl08PlbOUhYpbFEGC-F_LL_26o1-HT1AI'      # 109販促データ（本番）など
MASTER_SHEET_NAME= 'master'
CATS_SHEET_NAME  = 'カラーカテゴリ'

# ... (中略) ...

# --- GitHub ---
GH_OWNER   = 'y4m4usr'
GH_REPO    = 'HL001-quiz-karacon-academia'
GH_BRANCH  = 'main'
GH_CLONE_SSH = False  # CIならHTTPS+TOKENが無難

# 列名（CSV/シートのヘッダに合わせて変更）
COL_I_BRAND = 'ブランド（カナ）'
COL_J_COLOR = 'カラー（カナ）'
COL_K_PER   = '装用期間'
COL_G_CODE  = '品番'
COL_W_SAM   = 'サムネURL'
COL_X_LENS  = 'レンズURL'

# --- K列の正規化辞書（必要に応じて拡張） ---
PERIOD_MAP = {
    '1day':'1day','1-day':'1day','1 d':'1day','daily':'1day',
    '2week':'2week','2-weeks':'2week','biweekly':'2week',
    '1month':'1month','monthly':'1month'
}

# --- GitHub ---
GH_OWNER   = 'your-org-or-user'
GH_REPO    = 'HL001-quiz-karacon-academia-new'
GH_BRANCH  = 'main'
GH_CLONE_SSH = False  # CIならHTTPS+TOKENが無難

# --- レイアウト（最終構造） ---
LENS_BASE   = 'images/lens_shard'
SAMUNE_BASE = 'images/samune_shard'
MANIFEST_DIR= 'manifests'

# --- 作業ディレクトリ ---
WORK_DIR  = Path(os.environ.get('WORK_DIR', './work')).resolve()
REPO_DIR  = WORK_DIR / 'repo'
TMP_DIR   = WORK_DIR / 'tmp'

# --- 画像処理 ---
FORCE_JPG    = True
JPG_QUALITY  = 92
MAX_FILE_MB  = 6           # でかすぎる素材は除外
ALLOWED_TYPES= ('jpg','jpeg','png','webp')

# --- コミット分割 ---
FILES_PER_COMMIT = 400

# --- PR設定 ---
PR_BASE_BRANCH   = GH_BRANCH
PR_HEAD_PREFIX   = 'auto/daily/'
PR_TITLE_PREFIX  = 'chore(images): strict daily import'
PR_LABELS_OK     = ['auto', 'images']
PR_LABELS_BLOCK  = ['non-merge', 'needs-fix']

# ========== HELPERS ========== 

def die(msg:str, code:int=1):
    print(f'[FATAL] {msg}', file=sys.stderr)
    sys.exit(code)

def run(cmd:List[str], cwd:Optional[Path]=None, check=True) -> subprocess.CompletedProcess:
    print('[RUN]', ' '.join(cmd))
    return subprocess.run(cmd, cwd=str(cwd) if cwd else None, check=check)

def djb2_256(s:str)->int:
    h=5381
    for ch in s: h=((h<<5)+h)+ord(ch)
    return (h & 0xffffffff) % 256

def shard_hex(key:str)->str:
    return f'{djb2_256(key):02X}'  # 00..FF

def sanitize(s:str)->str:
    if s is None: return ''
    s = str(s).strip()
    s = unicodedata.normalize('NFKC', s)
    s = re.sub(r'[ \u3000]+', '_', s)
    s = re.sub(r'[・,、，/／]', '_', s)
    s = re.sub(r'[\:*?"<>|#%&{{}}$!@+=`^()[\]{{}}＜＞￥]', '', s)
    s = re.sub(r'_+', '_', s)
    return s.lower()

def normalize_period(k_raw:str)->str:
    s = sanitize(k_raw)
    return PERIOD_MAP.get(s, s)  # 未マップはそのまま → 不一致の温床なので要データ修正

def expected_key(code, brand, color, period)->str:
    return '|'.join([sanitize(code), sanitize(brand), sanitize(color), normalize_period(period)])

def expected_filename(code, brand, color, period, typ)->str:
    assert typ in ('lens','samune')
    return f'{sanitize(code)}_{sanitize(brand)}_{sanitize(color)}_{normalize_period(period)}_{typ}.jpg'

def ensure_jpg(src_path:Path, dst_path:Path):
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src_path) as im:
        im = im.convert('RGB')
        im.save(dst_path, format='JPEG', quality=JPG_QUALITY, optimize=True, progressive=True)

def copy_or_convert(src_path:Path, dst_path:Path):
    if FORCE_JPG or src_path.suffix.lower().lstrip('.') not in ('jpg','jpeg'):
        ensure_jpg(src_path, dst_path)
    else:
        dst_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_path, dst_path)

def sha256_of(path:Path)->str:
    h = hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(1<<20), b''):
            h.update(chunk)
    return h.hexdigest()

def raw_url(path_in_repo:str)->str:
    return f'https://raw.githubusercontent.com/{GH_OWNER}/{GH_REPO}/{GH_BRANCH}/{path_in_repo}'

# ========== Google 認証/取得 ========== 

def gcreds_from_env():
    if not GOOGLE_CREDENTIALS: 
        die('GOOGLE_CREDENTIALS が未設定')
    info = json.loads(GOOGLE_CREDENTIALS)
    scopes = [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/spreadsheets.readonly'
    ]
    return Credentials.from_service_account_info(info, scopes=scopes)

def read_sheets():
    creds = gcreds_from_env()
    gc = gspread.authorize(creds)
    sh = gc.open_by_key(SPREADSHEET_ID)
    ws_master = sh.worksheet(MASTER_SHEET_NAME)
    ws_cats   = sh.worksheet(CATS_SHEET_NAME)
    master = ws_master.get_all_records()
    cats   = ws_cats.get_all_records()
    return master, cats, creds

def build_catmap(cats)->Dict[Tuple[str,str], Dict]:
    m={}
    for r in cats:
        b = sanitize(r.get('ブランド（カナ）',''))
        c = sanitize(r.get('カラー（カナ）',''))
        if b and c: m[(b,c)] = r
    return m

def extract_drive_file_id(url:str)->Optional[str]:
    if not url: return None
    # パターン: /file/d/<id>/ or id=<id>
    m = re.search(r'/file/d/([a-zA-Z0-9_-]{20,})', url)
    if m: return m.group(1)
    m = re.search(r'[?&]id=([a-zA-Z0-9_-]{20,})', url)
    if m: return m.group(1)
    return None

def drive_download(drive_svc, file_id:str, dst:Path)->bool:
    try:
        req = drive_svc.files().get_media(fileId=file_id)
        fh  = io.FileIO(str(dst), 'wb')
        downloader = MediaIoBaseDownload(fh, req, chunksize=1<<20)
        done=False
        while not done:
            status, done = downloader.next_chunk()
        return True
    except Exception as e:
        print('[WARN] drive_download fail:', e)
        return False

# ========== GitHub / Git 操作 ========== 

def clone_or_reset_repo():
    if REPO_DIR.exists(): shutil.rmtree(REPO_DIR)
    REPO_DIR.mkdir(parents=True, exist_ok=True)
    if GH_CLONE_SSH:
        url = f'git@github.com:{GH_OWNER}/{GH_REPO}.git'
    else:
        url = f'https://{GITHUB_TOKEN}@github.com/{GH_OWNER}/{GH_REPO}.git'
    run(['git','clone','--depth','1','--branch',GH_BRANCH,url,str(REPO_DIR)])

def git_status_changes()->bool:
    cp = subprocess.run(['git','status','--porcelain'], cwd=str(REPO_DIR), capture_output=True, text=True)
    return bool(cp.stdout.strip())

def git_new_branch()->str:
    branch = PR_HEAD_PREFIX + time.strftime('%Y%m%d-%H%M%S')
    run(['git','checkout','-b',branch], cwd=REPO_DIR)
    return branch

def git_add_commit_chunked(files:List[Path], message:str):
    # 大量でも一旦まとめて add → 1コミット（必要なら分割に変更）
    run(['git','add','.'], cwd=REPO_DIR)
    run(['git','commit','-m', message], cwd=REPO_DIR)

def git_push(branch:str):
    run(['git','push','origin', branch], cwd=REPO_DIR)

def create_pr(branch:str, title:str, body:str, labels:List[str], draft:bool):
    url = f'https://api.github.com/repos/{GH_OWNER}/{GH_REPO}/pulls'
    headers = {'Authorization': f'token {GITHUB_TOKEN}',
               'Accept': 'application/vnd.github+json'}
    data = {
        'title': title,
        'head': branch,
        'base': PR_BASE_BRANCH,
        'body': body,
        'draft': draft
    }
    r = requests.post(url, headers=headers, json=data)
    if r.status_code not in (200,201): 
        print('[ERROR] create PR failed:', r.status_code, r.text)
        return None
    pr = r.json()
    # ラベル付与
    if labels:
        lab_url = (
            f"https://api.github.com/repos/{GH_OWNER}/{GH_REPO}/issues/{pr['number']}/labels"
        )
