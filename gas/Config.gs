
const GITHUB_REPO = {
  OWNER_REPO: 'y4m4usr/HL001-quiz-karacon-academia-new',
  BRANCH: 'main',
  LENS_IMAGE_PATH: 'images/_lensimage'
};

const SHEET_IDS = {
  MASTER:   '1EkTjV__k1vAl08PlbOUhYpbFEGC-F_LL_26o1-HT1AI', // HL001_テスト用_109販促データ（検証用）
  USERS:    '1X0TyeI_1zER6xIceUDSbJX-GFbqvi2orAiSWHRXlC7M',
  HISTORY:  '1ShWXLvY9RimRYfsAkwoRyM2Bfwj4a3zVmr5bQc33-o0',
  RANKINGS: '1I2REcy2v5OpyzoY3k61kCzJ3SYKOBBCMxTLCeHWutT8',
};

const SHEET_LAYOUT = {
  MASTER_HEADER_ROWS: 2,          // 1=タイトル等, 2=項目, 3〜データ
  MASTER_LAST_COL_A1: 'AL',       // 評価対象の最終列（余計な空白列の影響を防ぐ）
  CATEGORY_HEADER_ROWS: 1,        // 1=項目, 2〜データ（シートによっては2を指定）
  CATEGORY_LAST_COL_A1: 'F'       // カテゴリシートの読込上限列
};

const MANUAL_FIX = {
  FILE_NAME: 'manual_fix_queue.csv',
  MIME_TYPE: MimeType.CSV,
  DRIVE_FOLDER_ID: null // nullの場合はスクリプト同一ドライブ直下に出力
};

const COLS = {
  MASTER: {
    PRODUCT_CODE: 'E', // 元品番
    BRAND: 'I',       // ブランド（カナ）
    COLOR: 'J',       // カラー（カナ）
    WEAR_PERIOD: 'K', // 装用期間
    DIA: 'P',         // DIA
    GDIA: 'Q',        // G.DIA
    BC: 'R',          // BC
    THUMB_URL: 'W',   // サムネURL
    LENS_URL: 'X',    // レンズURL
    COMMENT: 'AL',    // コメント
  }
};
