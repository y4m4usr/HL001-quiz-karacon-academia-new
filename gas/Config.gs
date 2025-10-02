/** SPEC-LOCK: v1.2 最終構造化仕様
 * - master: 2行目=項目 / 3行目〜=データ
 * - 行内に空白セルが1つでもあれば不採用（評価範囲は AL まで）
 * - 必須 E/I/J/K（出題はX=レンズ、W=サムネは正解時のみ）
 * - ランタイムで Drive は使わず、GitHub直配信（raw→CDNフォールバック）
 * - 画像命名: E_I_J_K_[lens|samune].jpg
 */

const CFG = {
  // ※必ず置き換え
  SHEET_IDS: {
    MASTER: '1EkTjV__k1vAl08PlbOUhYpbFEGC-F_LL_26o1-HT1AI',
    CATEGORY: '1EkTjV__k1vAl08PlbOUhYpbFEGC-F_LL_26o1-HT1AI'
  },

  SHEETS: { MASTER: 'master', CATEGORY: 'カラーカテゴリ' },

  // ～AL列（38列）までを評価
  LAYOUT: {
    MASTER:   { HEADER_ROWS: 2, START_ROW: 3, LAST_COL_INDEX: 38 },
    CATEGORY: { HEADER_ROWS: 1, START_ROW: 2, LAST_COL_INDEX: 6 }
  },

  // 1-based（シートの列番号に合わせる）
  COLS: { E:5, I:9, J:10, K:11, P:16, Q:17, R:18, W:23, X:24, AL:38 },

  // GitHub 画像配置先（本番）
  GITHUB: {
    USER: 'y4m4usr',
    REPO: 'HL001-quiz-karacon-academemia-new',
    // 追随なら 'main'、検収固定ならコミットSHA
    REF : 'main',
    PATHS: {
      LENS_DIR   : 'imagesnew1/lens/lens1',
      SAMUNE_DIR : 'imagesnew1/samune/samune1'
    }
  },

  STRICT: {
    ROW_MUST_BE_FULL: true // 行内空白セルがあれば不採用（ALまで）
  }
};

function rawBase_(){
  const g=CFG.GITHUB; return `https://raw.githubusercontent.com/${g.USER}/${g.REPO}/${g.REF}`;
}
function toRaw_(path){
  return `${rawBase_()}/${String(path).replace(/^\/+/, '')}`;
}
function toCdnFallback_(rawUrl){
  // raw → jsDelivr
  return rawUrl.replace(
    /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i,
    'https://cdn.jsdelivr.net/gh/$1/$2@$3/$4'
  );
}
