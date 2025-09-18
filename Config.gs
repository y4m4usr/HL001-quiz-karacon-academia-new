/** 
 * 設定ファイル（v1.3対応）
 * - 画像：master の X列=24番目（Drive URL）
 * - 履歴タブ：quiz_history に統一
 * - HINT1：DIA / G.DIA / BC、HINT2：コメント
 * - 列インデックスは 1始まり（A=1）
 */
const CFG = {
  // クイズ設定（本番10問、1日1回、当日1回だけリセット可）
  TIME_PER_Q_SEC: 20,
  DAILY_LIMIT: 1,
  DAILY_RESET_MAX: 1,
  TOTAL_QUESTIONS: 10,

  // 減点式（不正解-10%／ヒント-3%／0〜100%）
  SCORE: { WRONG_PENALTY: 10, HINT_PENALTY: 3, MIN: 0, MAX: 100 },

  // ★各スプレッドシートIDを差し替えてください
  MASTER_BOOK_ID: '1EkTjV__k1vAl08PlbOUhYpbFEGC-F_LL_26o1-HT1AI',
  // 109販促データ（master / カラーカテゴリ）
  USERS_BOOK_ID:'1X0TyeI_1zER6xIceUDSbJX-GFbqvi2orAiSWHRXlC7M',
  QUIZ_HISTORY_BOOK_ID: '1ShWXLvY9RimRYfsAkwoRyM2Bfwj4a3zVmr5bQc33-o0',
  RANKINGS_BOOK_ID: '1I2REcy2v5OpyzoY3k61kCzJ3SYKOBBCMxTLCeHWutT8',

  // タブ名
  SHEETS: {
    MASTER: 'master',
    CATEGORY: 'カラーカテゴリ',
    USERS: 'users',
    QUIZ_HISTORY: 'quiz_history',  // v1.3で統一
    RANKINGS: 'rankings'
  },

  // ランタイム用タブ名（内部利用）
  SHEETS_RUNTIME: {
    USERS: 'users',
    QUIZ_SESS: 'quiz_history',  // セッション管理もquiz_historyシートで行う
    QUIZ_HISTORY: 'quiz_history',
    RANKINGS: 'rankings'
  },

  // 列マッピング（1始まり）
  COLS: {
    MASTER: {
      BRAND_KANA: 9,    // I列=9（ブランド名カナ）
      COLOR_KANA: 10,   // J列=10（カラー名カナ）
      DIA: 16,          // P列=16
      G_DIA: 17,        // Q列=17
      BC: 18,           // R列=18
      IMAGE_URL: 24,    // X列=24（レンズ画像URL ← v1.3）
      COMMENT: 38,      // AL列=38（コメント）※シート見出し確認のうえ調整可
      ACTIVE: 0         // アクティブ列なし=0
    },
    CATEGORY: {
      BRAND_KANA: 2,    // B列=2
      COLOR_KANA: 3,    // C列=3
      CATEGORIES: 6     // F列=6（カテゴリ一致で誤答選定）
    }
  },

  // 四択生成（カテゴリ一致＋類似度で「大きく異なる」カラー名を除外）
  QUIZ_LOGIC: { OPTIONS_COUNT: 4, MATCH_CATEGORY: true, EXCLUDE_SAME_COLOR: true },

  // ヒント
  HINTS: { HINT1_FIELDS: ['DIA', 'G_DIA', 'BC'], HINT2_FIELDS: ['COMMENT'] },

  // デバッグ
  DEBUG: { ENABLED: false, LOG_LEVEL: 'INFO' }
};

// 任意ユーティリティ
function testConfig(){ Logger.log(JSON.stringify(CFG, null, 2)); }

