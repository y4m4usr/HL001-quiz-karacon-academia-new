const CFG = {
	SHEET_IDS: {
		// v2.0 spec: 109販促データ（本番）
		MASTER: '1Uf2e0eXwcsQGjFtTtEeAWuYh74lh4fFE4NdjmyKHrj0',
		CATEGORY: '1Uf2e0eXwcsQGjFtTtEeAWuYh74lh4fFE4NdjmyKHrj0'
	},

	SHEETS: {
		MASTER: '20251005_HL001使用_109販促データCP',
		CATEGORY: 'カラーカテゴリ'
	},

	LAYOUT: {
		MASTER: { HEADER_ROWS: 2, START_ROW: 3, LAST_COL_INDEX: 38 }, // A..AL
		CATEGORY: { HEADER_ROWS: 1, START_ROW: 2, LAST_COL_INDEX: 6 }  // A..F
	},

	COLS: {
		E: 5, I: 9, J: 10, K: 11,
		P: 16, Q: 17, R: 18,
		W: 23, X: 24,
		AJ: 36, AK: 37,
		CAT_B: 2, CAT_C: 3, CAT_F: 6
	},

	GITHUB: {
		USER: 'y4m4usr',
		REPO: 'HL001-quiz-karacon-academia-new',
		REF: 'main',
		PATHS: { LENS_DIR: 'imagesnew1/lens/lens1', SAMUNE_DIR: 'imagesnew1/samune/samune1' }
	},

	STRICT: {
		// Use required columns only (E/I/J/K/X). Do not require full row fill.
		ROW_MUST_BE_FULL: false,
		ALLOW_REQUIRED_ONLY: true
	},

	// Prefer GitHub-named images per v2.0 spec (lens/samune)
	MIGRATION: { PERMIT_X_FALLBACK_GITHUB: true, PREFER_GITHUB: true },

	DEV: { WRITE_CSV: false }
};
