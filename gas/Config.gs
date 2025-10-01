/** SPEC-LOCK: v1.2 最終構造化仕様に準拠（masterは参照専用／X=レンズ, W=サムネ／GitHub直配信）. */
const CFG = {
  SHEET_IDS: { MASTER: '【1EkTjV__k1vAl08PlbOUhYpbFEGC-F_LL_26o1-HT1AI】', CATEGORY: '【同ID】' },
  SHEETS: { MASTER: 'master', CATEGORY: 'カラーカテゴリ' },
  LAYOUT: {
    MASTER:   { HEADER_ROWS: 2, START_ROW: 3, LAST_COL_INDEX: 38 },
    CATEGORY: { HEADER_ROWS: 1, START_ROW: 2, LAST_COL_INDEX: 6 }
  },
  COLS: { E:5, I:9, J:10, K:11, P:16, Q:17, R:18, W:23, X:24, AL:38 }, // 1-based
  GITHUB: {
    USER: 'y4m4usr',
    REPO: 'HL001-quiz-karacon-academia-new',
    REF: 'e2cbacf2d8d24222662151e6c4ed3edab7444774',
    PATHS: { 
      LENS_DIR   : 'imagesnew1/lens/lens1',
      SAMUNE_DIR : 'imagesnew1/samune/samune1',
      MANIFEST   : 'manifests/images_index.json'
    }
  },
  STRICT: { ROW_MUST_BE_FULL: true }, // 行内に空白セルがあれば不採用（ALまで評価）:contentReference[oaicite:13]{index=13}
};
function rawBase_(){ const g=CFG.GITHUB; return `https://raw.githubusercontent.com/${g.USER}/${g.REPO}/${g.REF}`; }
function toRaw_(path){ return `${rawBase_()}/${String(path).replace(/^\/+/, '')}`; }
