const CFG = {
	SHEET_IDS: {
		// Production spreadsheet that contains both sheets: master and カラーカテゴリ
		MASTER: '1VNpWeHTgSlNOnka4kdMd9TG1eCB3O5CTkBvg8co8uSM',
		CATEGORY: '1VNpWeHTgSlNOnka4kdMd9TG1eCB3O5CTkBvg8co8uSM'
	},

	SHEETS: {
		MASTER: 'master',
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
		AL: 38,
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

	// If X is blank, allow GitHub-named image fallback (set false to disable)
	MIGRATION: { PERMIT_X_FALLBACK_GITHUB: true },

	DEV: { WRITE_CSV: false }
};
