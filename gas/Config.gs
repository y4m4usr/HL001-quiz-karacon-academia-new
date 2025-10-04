const CFG = {
  SHEET_IDS: {
    MASTER  : '1EkTjV__k1vAl08PlbOUhYpbFEGC-F_LL_26o1-HT1AI',
    CATEGORY: '1EkTjV__k1vAl08PlbOUhYpbFEGC-F_LL_26o1-HT1AI'
  },
  SHEETS: { MASTER: 'master', CATEGORY: 'カラーカテゴリ' },

  LAYOUT: {
    MASTER  : { HEADER_ROWS: 2, START_ROW: 3, LAST_COL_INDEX: 38 }, // ～AL
    CATEGORY: { HEADER_ROWS: 1, START_ROW: 2, LAST_COL_INDEX: 6 }   // ～F
  },

  COLS: {
    E:5, I:9, J:10, K:11,
    P:16, Q:17, R:18,
    W:23, X:24,
    AL:38,
    CAT_B:2, CAT_C:3, CAT_F:6
  },

  GITHUB: {
    USER:'y4m4usr',
    REPO:'HL001-quiz-karacon-academia-new',
    REF :'main',
    PATHS:{ LENS_DIR:'imagesnew1/lens/lens1', SAMUNE_DIR:'imagesnew1/samune/samune1' }
  },

  STRICT: {
    ROW_MUST_BE_FULL    : true,   // 行内空白が1つでもあれば除外（本番仕様）
    ALLOW_REQUIRED_ONLY : false   // ★ 仕様に合わせて救済OFF（E/I/J/K/X すべて必須）
  },

  // ★ 移行中の保険：Xが空なら GitHub 命名でレンズ画像を補完（整備後は false に）
  MIGRATION: { PERMIT_X_FALLBACK_GITHUB: true },

  DEV: { WRITE_CSV:false }        // Drive依存は完全停止
};
