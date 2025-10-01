
/** SPEC-LOCK: 本ファイルは「最終構造化仕様（出題ロジック簡素化版）」に準拠し、以下を厳守する。
 *  - 2行目=項目／3行目〜=データ、行内に空白セルが1つでもあれば不採用（評価範囲は CFG.LAYOUT の LAST_COL_INDEX まで）
 *  - 必須列 E/I/J/K/X がすべて非空。クイズ表示は X=レンズのみ。W=サムネは正解時フィードバック用。
 *  - ランタイムで Drive は触らない（CSV出力や DriveApp を使用しない）。manual_fix_queue はシートへ追記。
 *  - CK=E|I|J|K でランキング/マイ成績を集計。
 * 改変が必要な場合は Config のみ変更し、関数の契約は変えないこと。
 */const GITHUB_REPO = {
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
  SHEET_NAME: 'manual_fix_queue',
  HEADER: ['sheet', 'row', 'key', 'reason', 'detail']
};

const EVALUATION_FLAGS = {
  STRICT_BLANK_CHECK: true
};

const DEV_FEATURES = {
  ALLOW_SEED_DATA: false,
  ALLOW_PLACEHOLDER: false
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
