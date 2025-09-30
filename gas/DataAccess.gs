// ===================================================================
// データアクセス (スプレッドシート、カテゴリマッピング)
// ===================================================================

// 定数 (v1.7: Config.gsから読み込む想定)
const CATEGORY_SHEET_NAME = 'カラーカテゴリ';
const COL_C = {SERIES: 2, COLOR: 3, CATEGORIES: 6 }; // カテゴリシートの列
let MASTER_COLUMN_INDEXES = null;

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

    const masterHeaderRows = (SHEET_LAYOUT && SHEET_LAYOUT.MASTER_HEADER_ROWS) || 2;
    const masterDataStartRow = masterHeaderRows + 1;
    const masterLastCol = colLetterToIndex_((SHEET_LAYOUT && SHEET_LAYOUT.MASTER_LAST_COL_A1) || 'AL') + 1;
    const masterRowCount = Math.max(0, shM.getLastRow() - masterHeaderRows);
    const masterColCount = Math.min(masterLastCol, shM.getLastColumn());
    const masterData = masterRowCount > 0 && masterColCount > 0
      ? shM.getRange(masterDataStartRow, 1, masterRowCount, masterColCount).getValues()
      : [];

    const categoryHeaderRows = (SHEET_LAYOUT && SHEET_LAYOUT.CATEGORY_HEADER_ROWS) || 1;
    const categoryDataStartRow = categoryHeaderRows + 1;
    const categoryLastCol = colLetterToIndex_((SHEET_LAYOUT && SHEET_LAYOUT.CATEGORY_LAST_COL_A1) || 'F') + 1;
    const categoryRowCount = Math.max(0, shC.getLastRow() - categoryHeaderRows);
    const categoryColCount = Math.min(categoryLastCol, shC.getLastColumn());
    const categoryData = categoryRowCount > 0 && categoryColCount > 0
      ? shC.getRange(categoryDataStartRow, 1, categoryRowCount, categoryColCount).getValues()
      : [];

    const catMap = buildCategoryMap_(categoryData);
    const evaluation = evaluateMasterRows_(masterData, masterDataStartRow, catMap);
    const candidates = evaluation.candidates;

    writeManualFixQueue_(evaluation.manualFix);

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
  const masterHeaderRows = (SHEET_LAYOUT && SHEET_LAYOUT.MASTER_HEADER_ROWS) || 2;
  return evaluateMasterRows_(masterData, masterHeaderRows + 1, catMap).candidates;
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

function evaluateMasterRows_(masterData, dataStartRow, catMap) {
  const idx = getMasterColumnIndexes_();
  const candidates = [];
  const manualFix = [];

  const summary = {
    totalMasterRows: masterData.length,
    excludedEmptyRows: 0,
    excludedBlankCells: 0,
    excludedMissingRequired: 0,
    excludedInvalidLensUrl: 0,
    excludedMissingCategory: 0,
    validCandidateKeys: new Set()
  };

  const samples = {
    emptyRows: [],
    blankCells: [],
    missingRequired: [],
    invalidLensUrl: [],
    missingCategory: []
  };

  masterData.forEach((row, index) => {
    const rowNumber = dataStartRow + index;

    if (isEmptyRow_(row)) {
      summary.excludedEmptyRows++;
      if (samples.emptyRows.length < 5) {
        samples.emptyRows.push(`masterシート ${rowNumber}行目: 空行のため除外`);
      }
      return;
    }

    const firstBlankIndex = findFirstBlankCellIndex_(row);
    if (firstBlankIndex >= 0) {
      summary.excludedBlankCells++;
      const colLetter = colIndexToLetter_(firstBlankIndex);
      if (samples.blankCells.length < 5) {
        samples.blankCells.push(`masterシート ${rowNumber}行目: 列${colLetter} が空のため除外`);
      }
      pushManualFix_(manualFix, {
        sheet: 'master',
        row: rowNumber,
        keyParts: [],
        reason: 'blank_cell',
        detail: `列${colLetter} が空です`
      });
      return;
    }

    const record = {
      E: s_(row[idx.PRODUCT_CODE]),
      I: s_(row[idx.BRAND]),
      J: s_(row[idx.COLOR]),
      K: s_(row[idx.WEAR_PERIOD]),
      X: s_(row[idx.LENS_URL]),
      W: s_(row[idx.THUMB_URL]),
      P: s_(row[idx.DIA]),
      Q: s_(row[idx.GDIA]),
      R: s_(row[idx.BC]),
      AL: s_(row[idx.COMMENT])
    };

    const missing = [];
    if (!record.E) missing.push('E');
    if (!record.I) missing.push('I');
    if (!record.J) missing.push('J');
    if (!record.K) missing.push('K');
    if (!record.X) missing.push('X');

    if (missing.length) {
      summary.excludedMissingRequired++;
      if (samples.missingRequired.length < 5) {
        samples.missingRequired.push(`masterシート ${rowNumber}行目: 必須列(${missing.join(',')})が空です。`);
      }
      pushManualFix_(manualFix, {
        sheet: 'master',
        row: rowNumber,
        keyParts: [record.E, record.I, record.J, record.K],
        reason: 'missing_required',
        detail: `必須列(${missing.join(',')})が空です`
      });
      return;
    }

    if (!isValidHttpUrl_(record.X)) {
      summary.excludedInvalidLensUrl++;
      if (samples.invalidLensUrl.length < 5) {
        samples.invalidLensUrl.push(`masterシート ${rowNumber}行目: レンズURLが不正です (${record.X})`);
      }
      pushManualFix_(manualFix, {
        sheet: 'master',
        row: rowNumber,
        keyParts: [record.E, record.I, record.J, record.K],
        reason: 'invalid_lens_url',
        detail: `レンズURLが無効です (${record.X})`
      });
      return;
    }

    const catKey = `${record.I}|${record.J}`;
    const colorWords = catMap.get(catKey);
    if (!colorWords || colorWords.size === 0) {
      summary.excludedMissingCategory++;
      if (samples.missingCategory.length < 5) {
        samples.missingCategory.push(`masterシート ${rowNumber}行目: カテゴリ未登録 (キー: ${catKey})`);
      }
      pushManualFix_(manualFix, {
        sheet: 'master',
        row: rowNumber,
        keyParts: [record.E, record.I, record.J, record.K],
        reason: 'category_not_found',
        detail: `カテゴリ未登録 (キー: ${catKey})`
      });
      return;
    }

    const candidate = {
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
      rowIndex: rowNumber
    };

    candidates.push(candidate);
    summary.validCandidateKeys.add(candidate.key);
  });

  return { candidates, manualFix, summary, samples };
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
  if (typeof col !== 'string' || !col.trim()) {
    throw new Error(`列記号が未定義です: ${col}`);
  }
  const normalized = col.trim().toUpperCase();
  let index = 0;
  for (let i = 0; i < normalized.length; i++) {
    index = index * 26 + (normalized.charCodeAt(i) - 64);
  }
  return index - 1;
}

function getMasterColumnIndexes_() {
  if (MASTER_COLUMN_INDEXES) return MASTER_COLUMN_INDEXES;
  if (typeof COLS === 'undefined' || !COLS || !COLS.MASTER) {
    throw new Error('COLS.MASTER が未定義です。Config.gs の設定を確認してください。');
  }

  const map = {};
  Object.entries(COLS.MASTER).forEach(([key, letter]) => {
    if (typeof letter !== 'string' || !letter.trim()) {
      throw new Error(`COLS.MASTER.${key} が未設定です。Config.gs を確認してください。`);
    }
    map[key] = colLetterToIndex_(letter);
  });

  MASTER_COLUMN_INDEXES = map;
  return MASTER_COLUMN_INDEXES;
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

function findFirstBlankCellIndex_(row){
  for(let i=0;i<row.length;i++){
    if(s_(row[i])==='') return i;
  }
  return -1;
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

function pushManualFix_(collector, entry){
  if(!collector) return;
  const keyParts = (entry && entry.keyParts) || [];
  collector.push({
    sheet: entry.sheet || '',
    row: entry.row || '',
    key: keyParts.filter(Boolean).join('|'),
    reason: entry.reason || '',
    detail: entry.detail || ''
  });
}

function csvEscape_(value){
  if(value === null || value === undefined) return '';
  const str = String(value);
  if(/[",\n]/.test(str)){
    return '"' + str.replace(/"/g,'""') + '"';
  }
  return str;
}

function writeManualFixQueue_(rows){
  try{
    const lines = ['sheet,row,key,reason,detail'];
    (rows || []).forEach(entry => {
      lines.push([
        csvEscape_(entry.sheet),
        csvEscape_(entry.row),
        csvEscape_(entry.key),
        csvEscape_(entry.reason),
        csvEscape_(entry.detail)
      ].join(','));
    });

    const csvContent = lines.join('\n');
    const fileName = (MANUAL_FIX && MANUAL_FIX.FILE_NAME) || 'manual_fix_queue.csv';
    const mimeType = (MANUAL_FIX && MANUAL_FIX.MIME_TYPE) || MimeType.CSV;
    const folder = MANUAL_FIX && MANUAL_FIX.DRIVE_FOLDER_ID
      ? DriveApp.getFolderById(MANUAL_FIX.DRIVE_FOLDER_ID)
      : DriveApp.getRootFolder();

    let fileIterator = folder.getFilesByName(fileName);
    if(fileIterator.hasNext()){
      const file = fileIterator.next();
      file.setTrashed(false);
      file.setContent(csvContent);
    } else {
      folder.createFile(fileName, csvContent, mimeType);
    }
  }catch(e){
    console.error('manual_fix_queue.csv の出力に失敗しました: ' + e.message);
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

    const masterHeaderRows = (SHEET_LAYOUT && SHEET_LAYOUT.MASTER_HEADER_ROWS) || 2;
    const masterDataStartRow = masterHeaderRows + 1;
    const masterLastCol = colLetterToIndex_((SHEET_LAYOUT && SHEET_LAYOUT.MASTER_LAST_COL_A1) || 'AL') + 1;
    const masterRowCount = Math.max(0, shM.getLastRow() - masterHeaderRows);
    const masterColCount = Math.min(masterLastCol, shM.getLastColumn());
    const masterData = masterRowCount > 0 && masterColCount > 0
      ? shM.getRange(masterDataStartRow, 1, masterRowCount, masterColCount).getValues()
      : [];

    const categoryHeaderRows = (SHEET_LAYOUT && SHEET_LAYOUT.CATEGORY_HEADER_ROWS) || 1;
    const categoryDataStartRow = categoryHeaderRows + 1;
    const categoryLastCol = colLetterToIndex_((SHEET_LAYOUT && SHEET_LAYOUT.CATEGORY_LAST_COL_A1) || 'F') + 1;
    const categoryRowCount = Math.max(0, shC.getLastRow() - categoryHeaderRows);
    const categoryColCount = Math.min(categoryLastCol, shC.getLastColumn());
    const categoryData = categoryRowCount > 0 && categoryColCount > 0
      ? shC.getRange(categoryDataStartRow, 1, categoryRowCount, categoryColCount).getValues()
      : [];

    const catMap = buildCategoryMap_(categoryData);
    const evaluation = evaluateMasterRows_(masterData, masterDataStartRow, catMap);
    const summary = evaluation.summary;
    const samples = evaluation.samples;

    return {
      total_master_rows: summary.totalMasterRows,
      category_map_entries: catMap.size,
      excluded_empty_rows: summary.excludedEmptyRows,
      excluded_blank_cells: summary.excludedBlankCells,
      excluded_missing_required: summary.excludedMissingRequired,
      excluded_invalid_lens_url: summary.excludedInvalidLensUrl,
      excluded_missing_category: summary.excludedMissingCategory,
      final_unique_candidates: summary.validCandidateKeys.size,
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
