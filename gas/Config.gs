/** SPEC-LOCK: v1.2 最終構造化仕様
 * - 2行目=項目、3行目〜=データ本体
 * - 厳格: 行内に空白セルが1つでもあれば不採用
 * - 救済: 必須列（E/I/J/K/X）だけ埋まっていれば採用（本番復旧用）
 * - 出題画像は命名規則から GitHub 直配信（raw → CDN フォールバック）
 */
const CFG = {
  SHEET_IDS: {
    MASTER: '【1EkTjV__k1vAl08PlbOUhYpbFEGC-F_LL_26o1-HT1AI】',
    CATEGORY: '【1EkTjV__k1vAl08PlbOUhYpbFEGC-F_LL_26o1-HT1AI】'
  },
  SHEETS: { MASTER: 'master', CATEGORY: 'カラーカテゴリ' },

  LAYOUT: {
    MASTER:   { HEADER_ROWS: 2, START_ROW: 3, LAST_COL_INDEX: 38 }, // ～AL
    CATEGORY: { HEADER_ROWS: 1, START_ROW: 2, LAST_COL_INDEX: 6  }  // ～F
  },

  // 1-based index（A=1）
  COLS: {
    // master（主要）
    E:5, I:9, J:10, K:11, P:16, Q:17, R:18, W:23, X:24, AL:38,
    // category（B=I, C=J, F=カテゴリ）
    CAT_B:2, CAT_C:3, CAT_F:6
  },

  GITHUB: {
    USER: 'y4m4usr',
    REPO: 'HL001-quiz-karacon-academia-new',
    REF : 'main', // または検収用コミットSHA
    PATHS: {
      LENS_DIR   : 'imagesnew1/lens/lens1',
      SAMUNE_DIR : 'imagesnew1/samune/samune1'
    }
  },

  STRICT: {
    ROW_MUST_BE_FULL   : true,   // 厳格: 行内空白が1つでもあれば除外
    ALLOW_REQUIRED_ONLY: true    // ★ 復旧用: E/I/J/K/X 必須のみで採用
  },

  DEV: {
    WRITE_CSV: false // ★ manual_fix_queue.csv を完全停止
  }
};

function rawBase_(){ const g=CFG.GITHUB; return `https://raw.githubusercontent.com/${g.USER}/${g.REPO}/${g.REF}`; }
function toRaw_(path){ return `${rawBase_()}/${String(path).replace(/^\/+/, '')}`; }
function toCdnFallback_(rawUrl){
  return rawUrl.replace(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i,
                        'https://cdn.jsdelivr.net/gh/$1/$2@$3/$4');
}
