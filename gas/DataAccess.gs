// ===================================================================
// データアクセス (スプレッドシート、カテゴリマッピング)
// ===================================================================

// 定数 (v1.7: Config.gsから読み込む想定)
const DATA_START_ROW = 3;
const CATEGORY_SHEET_NAME = 'カラーカテゴリ';
const COL_C = {SERIES: 2, COLOR: 3, CATEGORIES: 6 }; // カテゴリシートの列

/**
 * フロントエンドから呼ばれるメイン関数 (問題取得)
 * @param {object} params - { count: number }
 * @returns {Array<object>} 生成された問題の配列
 */
function getQuestions(params) {
  try {
    const count = Math.max(1, Math.min(20, (params && params.count) || 10));
    const ss = SpreadsheetApp.openById(SHEET_IDS.MASTER);
    const shM = ss.getSheetByName('master');
    const shC = ss.getSheetByName(CATEGORY_SHEET_NAME);

    if (!shM) throw new Error('「master」シートが見つかりません。');
    if (!shC) throw new Error('「カラーカテゴリ」シートが見つかりません。');

    const masterData = shM.getRange(DATA_START_ROW, 1, shM.getLastRow() - DATA_START_ROW + 1, shM.getLastColumn()).getValues();
    const categoryData = shC.getRange(DATA_START_ROW, 1, shC.getLastRow() - DATA_START_ROW + 1, shC.getLastColumn()).getValues();
    
    const catMap = buildCategoryMap_(categoryData);
    const candidates = buildCandidates_(masterData, catMap);
    
    // v1.7 堅牢化: 候補リストの総数と、ユニークなキーの数をチェックする
    const uniqueKeys = new Set(candidates.map(c => c.key));
    Logger.log(`有効な候補データの総数: ${candidates.length}件`);
    Logger.log(`ユニークな「E|I|J|K」キーの件数: ${uniqueKeys.size}件`);

    if (uniqueKeys.size < 4) {
      // 正解1件＋不正解3件のユニークな組み合わせが作れないため、ここでエラーとする
      throw new Error('クイズを作成するのに十分なデータがありません（最低4件必要です）。');
    }

    shuffle_(candidates); // QuizLogic.gsにある想定
    
    const questions = [];
    const usedKeys = new Set();
    for (const cand of candidates) {
      if (questions.length >= count) break;
      if (usedKeys.has(cand.key)) continue;
      
      const q = buildQuestion_(cand, candidates); // QuizLogic.gsにある想定
      if (q) {
        questions.push(q);
        usedKeys.add(cand.key);
      }
    }
    
    return questions;

  } catch (e) {
    console.error('getQuestions failed: ' + e.stack);
    throw new Error('問題の生成中にサーバーでエラーが発生しました: ' + e.message);
  }
}

/**
 * マスターデータからクイズ候補を生成する
 * @param {Array<Array<any>>} masterData - マスタシートの全データ
 * @param {Map<string, Set<string>>} catMap - ブランド/カラーごとの色カテゴリ集合
 * @return {Array<object>} 候補オブジェクトの配列
 */
function buildCandidates_(masterData, catMap) {
  const candidates = [];
  const C = COLS.MASTER;

  masterData.forEach((row, index) => {
    if (isEmptyRow_(row)) return; // まるごと空行は除外
    if (hasBlankCell_(row)) return; // いずれかのセルが空なら除外（絶対条件）

    const record = {
      E: s_(row[colLetterToIndex_(C.PRODUCT_CODE)]),
      I: s_(row[colLetterToIndex_(C.BRAND)]),
      J: s_(row[colLetterToIndex_(C.COLOR)]),
      K: s_(row[colLetterToIndex_(C.WEAR_PERIOD)]),
      X: s_(row[colLetterToIndex_(C.LENS_URL)]),
      W: s_(row[colLetterToIndex_(C.THUMB_URL)]),
      P: s_(row[colLetterToIndex_(C.DIA)]),
      Q: s_(row[colLetterToIndex_(C.GDIA)]),
      R: s_(row[colLetterToIndex_(C.BC)]),
      AL: s_(row[colLetterToIndex_(C.COMMENT)])
    };

    if (!record.E || !record.I || !record.J || !record.K || !record.X) return;
    if (!isValidHttpUrl_(record.X)) return; // X列は有効なURLである必要がある

    const catKey = `${record.I}|${record.J}`;
    const colorWords = catMap.get(catKey);
    if (!colorWords || colorWords.size === 0) return; // カテゴリ未定義は除外

    candidates.push({
      key: `${record.E}|${record.I}|${record.J}|${record.K}`,
      categoryKey: catKey,
      itemCode: record.E,
      brand: record.I,
      color: record.J,
      wearPeriod: record.K,
      lensUrl: record.X,
      thumbUrl: isValidHttpUrl_(record.W) ? record.W : '',
      colorWords: new Set(colorWords),
      label: `${record.I} / ${record.J}`,
      dia: record.P,
      gDia: record.Q,
      bc: record.R,
      comment: record.AL,
      hint1: `DIA:${record.P} / G.DIA:${record.Q} / BC:${record.R}`,
      hint2: record.AL,
      specs: { DIA: record.P, G_DIA: record.Q, BC: record.R },
      rowIndex: index + DATA_START_ROW
    });
  });

  return candidates;
}

/**
 * カテゴリシートのデータから、ブランド/カラー→色カテゴリ集合のMapを生成する
 * @param {Array<Array<any>>} categoryData
 * @return {Map<string, Set<string>>}
 */
function buildCategoryMap_(categoryData) {
  const catMap = new Map();

  categoryData.forEach(row => {
    const brand = s_(row[COL_C.SERIES - 1]);
    const color = s_(row[COL_C.COLOR - 1]);
    const rawCats = s_(row[COL_C.CATEGORIES - 1]);

    if (!brand || !color || !rawCats) return; // B/C/F のいずれかが空なら除外

    const key = `${brand}|${color}`;
    const set = catMap.get(key) || new Set();

    rawCats.split(/[，,、／/・\s]+/).forEach(token => {
      const normalized = token.trim();
      if (normalized) set.add(normalized);
    });

    if (set.size > 0) {
      catMap.set(key, set);
    }
  });

  return catMap;
}

// ===================================================================
// 内部ヘルパー関数 (DataAccess関連)
// ===================================================================

/**
 * スプレッドシートの列文字 (A, B, AA, ALなど) を0ベースのインデックスに変換する
 * @param {string} col - 列文字
 * @returns {number} 0ベースの列インデックス
 */
function colLetterToIndex_(col) {
  let index = 0;
  for (let i = 0; i < col.length; i++) {
    index = index * 26 + (col.charCodeAt(i) - 64);
  }
  return index - 1;
}

function colIndexToLetter_(index){
  let n=index+1;
  let result='';
  while(n>0){
    const rem=(n-1)%26;
    result=String.fromCharCode(65+rem)+result;
    n=Math.floor((n-1)/26);
  }
  return result;
}

/**
 * 値をトリムして文字列に変換する
 */
function s_(v){return(v===null||v===undefined)?'':String(v).trim()}

/**
 * 行内に空セルが含まれているかを判定する
 * @param {Array<any>} row
 * @return {boolean}
 */
function hasBlankCell_(row){
  return row.some(cell=>s_(cell)==='');
}

/**
 * 行全体が空かを判定する
 * @param {Array<any>} row
 * @return {boolean}
 */
function isEmptyRow_(row){
  return row.every(cell=>s_(cell)==='');
}

/**
 * HTTP/HTTPSのURLかどうかを判定する
 * @param {string} value
 * @return {boolean}
 */
function isValidHttpUrl_(value){
  if(!value) return false;
  try{
    const url=new URL(value);
    return url.protocol==='https:'||url.protocol==='http:';
  }catch(e){
    return false;
  }
}

/**
 * ===================================================================
 * デバッグ用関数
 * ===================================================================
 */
function debugDataProcessing() {
  try {
    const ss = SpreadsheetApp.openById(SHEET_IDS.MASTER);
    const shM = ss.getSheetByName('master');
    const shC = ss.getSheetByName(CATEGORY_SHEET_NAME);

    if (!shM) return { error: '「master」シートが見つかりません。' };
    if (!shC) return { error: `「${CATEGORY_SHEET_NAME}」シートが見つかりません。` };

    const masterData = shM.getRange(DATA_START_ROW, 1, shM.getLastRow() - DATA_START_ROW + 1, shM.getLastColumn()).getValues();
    const categoryData = shC.getRange(DATA_START_ROW, 1, shC.getLastRow() - DATA_START_ROW + 1, shC.getLastColumn()).getValues();

    const catMap = buildCategoryMap_(categoryData);
    const C = COLS.MASTER;

    const totalMasterRows = masterData.length;
    let excludedEmptyRows = 0;
    let excludedBlankCells = 0;
    let excludedMissingRequired = 0;
    let excludedInvalidLensUrl = 0;
    let excludedMissingCategory = 0;

    const samples = {
      emptyRows: [],
      blankCells: [],
      missingRequired: [],
      invalidLensUrl: [],
      missingCategory: []
    };

    const validCandidateKeys = new Set();

    masterData.forEach((row, index) => {
      const rowNumber = index + DATA_START_ROW;

      if (isEmptyRow_(row)) {
        excludedEmptyRows++;
        if (samples.emptyRows.length < 5) {
          samples.emptyRows.push(`masterシート ${rowNumber}行目: 空行のため除外`);
        }
        return;
      }

      const firstBlankIndex = row.findIndex(cell => s_(cell) === '');
      if (firstBlankIndex >= 0) {
        excludedBlankCells++;
        if (samples.blankCells.length < 5) {
          const colLetter = colIndexToLetter_(firstBlankIndex);
          samples.blankCells.push(`masterシート ${rowNumber}行目: 列${colLetter} が空のため除外`);
        }
        return;
      }

      const record = {
        E: s_(row[colLetterToIndex_(C.PRODUCT_CODE)]),
        I: s_(row[colLetterToIndex_(C.BRAND)]),
        J: s_(row[colLetterToIndex_(C.COLOR)]),
        K: s_(row[colLetterToIndex_(C.WEAR_PERIOD)]),
        X: s_(row[colLetterToIndex_(C.LENS_URL)])
      };

      const missing = [];
      if (!record.E) missing.push('E');
      if (!record.I) missing.push('I');
      if (!record.J) missing.push('J');
      if (!record.K) missing.push('K');
      if (!record.X) missing.push('X');

      if (missing.length) {
        excludedMissingRequired++;
        if (samples.missingRequired.length < 5) {
          samples.missingRequired.push(`masterシート ${rowNumber}行目: 必須列(${missing.join(',')})が空です。`);
        }
        return;
      }

      if (!isValidHttpUrl_(record.X)) {
        excludedInvalidLensUrl++;
        if (samples.invalidLensUrl.length < 5) {
          samples.invalidLensUrl.push(`masterシート ${rowNumber}行目: レンズURLが不正です (${record.X})`);
        }
        return;
      }

      const catKey = `${record.I}|${record.J}`;
      const colorWords = catMap.get(catKey);
      if (!colorWords || colorWords.size === 0) {
        excludedMissingCategory++;
        if (samples.missingCategory.length < 5) {
          samples.missingCategory.push(`masterシート ${rowNumber}行目: カテゴリ未登録 (キー: ${catKey})`);
        }
        return;
      }

      validCandidateKeys.add(`${record.E}|${record.I}|${record.J}|${record.K}`);
    });

    return {
      total_master_rows: totalMasterRows,
      category_map_entries: catMap.size,
      excluded_empty_rows: excludedEmptyRows,
      excluded_blank_cells: excludedBlankCells,
      excluded_missing_required: excludedMissingRequired,
      excluded_invalid_lens_url: excludedInvalidLensUrl,
      excluded_missing_category: excludedMissingCategory,
      final_unique_candidates: validCandidateKeys.size,
      debug_examples_empty_rows: samples.emptyRows,
      debug_examples_blank_cells: samples.blankCells,
      debug_examples_missing_required: samples.missingRequired,
      debug_examples_invalid_lens_url: samples.invalidLensUrl,
      debug_examples_missing_category: samples.missingCategory
    };
  } catch (e) {
    return { error: 'デバッグ処理中に予期せぬエラーが発生しました: ' + e.message, stack: e.stack };
  }
}
