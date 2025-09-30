// ===================================================================
// データ整備ユーティリティ（テスト用）
// ===================================================================

function seedMinimalQuizData() {
  const ss = SpreadsheetApp.openById(SHEET_IDS.MASTER);
  const shMaster = ss.getSheetByName('master');
  const shCategory = ss.getSheetByName(CATEGORY_SHEET_NAME);

  if (!shMaster) throw new Error('「master」シートが見つかりません。');
  if (!shCategory) throw new Error('「カラーカテゴリ」シートが見つかりません。');

  const masterLayout = SHEET_LAYOUT || {};
  const masterHeaderRows = masterLayout.MASTER_HEADER_ROWS || 2;
  const masterDataStartRow = masterHeaderRows + 1;
  const masterLastColIndex = colLetterToIndex_(masterLayout.MASTER_LAST_COL_A1 || 'AL');
  const masterColCount = Math.min(masterLastColIndex + 1, shMaster.getLastColumn());
  const masterRowCount = Math.max(0, shMaster.getLastRow() - masterHeaderRows);
  const masterValues = masterRowCount > 0 && masterColCount > 0
    ? shMaster.getRange(masterDataStartRow, 1, masterRowCount, masterColCount).getValues()
    : [];

  const masterIndex = getMasterColumnIndexes_();

  const existingMasterMap = new Map();
  masterValues.forEach((row, i) => {
    const key = `${s_(row[masterIndex.PRODUCT_CODE])}|${s_(row[masterIndex.BRAND])}|${s_(row[masterIndex.COLOR])}|${s_(row[masterIndex.WEAR_PERIOD])}`;
    if (key.replace(/\|/g, '')) existingMasterMap.set(key, i);
  });

  const categoryLayout = SHEET_LAYOUT || {};
  const categoryHeaderRows = categoryLayout.CATEGORY_HEADER_ROWS || 1;
  const categoryDataStartRow = categoryHeaderRows + 1;
  const categoryLastColIndex = colLetterToIndex_(categoryLayout.CATEGORY_LAST_COL_A1 || 'F');
  const categoryColCount = Math.min(categoryLastColIndex + 1, shCategory.getLastColumn());
  const categoryRowCount = Math.max(0, shCategory.getLastRow() - categoryHeaderRows);
  const categoryValues = categoryRowCount > 0 && categoryColCount > 0
    ? shCategory.getRange(categoryDataStartRow, 1, categoryRowCount, categoryColCount).getValues()
    : [];

  const categoryMap = new Map();
  categoryValues.forEach((row, i) => {
    const brand = s_(row[COL_C.SERIES - 1]);
    const color = s_(row[COL_C.COLOR - 1]);
    if (brand && color) categoryMap.set(`${brand}|${color}`, i);
  });

  const baseLensUrl = 'https://via.placeholder.com/512x512.png?text=';
  const baseThumbUrl = 'https://via.placeholder.com/256x256.png?text=';

  const sampleRecords = [
    {
      E: 'QZ001',
      I: 'クイックテスト',
      J: 'ブラウン',
      K: '1day',
      categories: ['ブラウン', 'ベージュ'],
      lensUrl: `${baseLensUrl}QZ001`,
      thumbUrl: `${baseThumbUrl}QZ001`
    },
    {
      E: 'QZ002',
      I: 'クイックテスト',
      J: 'グレー',
      K: '1day',
      categories: ['グレー'],
      lensUrl: `${baseLensUrl}QZ002`,
      thumbUrl: `${baseThumbUrl}QZ002`
    },
    {
      E: 'QZ003',
      I: 'クイックテスト',
      J: 'オリーブ',
      K: '1month',
      categories: ['グリーン', 'オリーブ'],
      lensUrl: `${baseLensUrl}QZ003`,
      thumbUrl: `${baseThumbUrl}QZ003`
    },
    {
      E: 'QZ004',
      I: 'クイックテスト',
      J: 'ピンク',
      K: '1day',
      categories: ['ピンク', 'ブラウン'],
      lensUrl: `${baseLensUrl}QZ004`,
      thumbUrl: `${baseThumbUrl}QZ004`
    },
    {
      E: 'QZ005',
      I: 'クイックテスト',
      J: 'ベージュ',
      K: '2week',
      categories: ['ベージュ', 'ブラウン'],
      lensUrl: `${baseLensUrl}QZ005`,
      thumbUrl: `${baseThumbUrl}QZ005`
    }
  ];

  const defaultMasterValue = 'N/A';
  sampleRecords.forEach(record => {
    const key = `${record.E}|${record.I}|${record.J}|${record.K}`;
    const rowValues = Array(masterColCount).fill(defaultMasterValue);
    rowValues[masterIndex.PRODUCT_CODE] = record.E;
    rowValues[masterIndex.BRAND] = record.I;
    rowValues[masterIndex.COLOR] = record.J;
    rowValues[masterIndex.WEAR_PERIOD] = record.K;
    rowValues[masterIndex.LENS_URL] = record.lensUrl;
    rowValues[masterIndex.THUMB_URL] = record.thumbUrl;
    rowValues[masterIndex.DIA] = '14.2';
    rowValues[masterIndex.GDIA] = '13.4';
    rowValues[masterIndex.BC] = '8.6';
    rowValues[masterIndex.COMMENT] = 'テストデータ';

    const existingRowIndex = existingMasterMap.get(key);
    if (existingRowIndex !== undefined) {
      shMaster.getRange(masterDataStartRow + existingRowIndex, 1, 1, masterColCount).setValues([rowValues]);
    } else {
      shMaster.appendRow(rowValues);
    }

    const categoryKey = `${record.I}|${record.J}`;
    const catRowValues = Array(categoryColCount).fill(defaultMasterValue);
    catRowValues[COL_C.SERIES - 1] = record.I;
    catRowValues[COL_C.COLOR - 1] = record.J;
    catRowValues[COL_C.CATEGORIES - 1] = record.categories.join(',');

    const existingCatIndex = categoryMap.get(categoryKey);
    if (existingCatIndex !== undefined) {
      shCategory.getRange(categoryDataStartRow + existingCatIndex, 1, 1, categoryColCount).setValues([catRowValues]);
    } else {
      shCategory.appendRow(catRowValues);
    }
  });

  SpreadsheetApp.flush();
}

function debugGetQuestionsCount() {
  const questions = getQuestions({ count: 10 });
  Logger.log(`Generated questions: ${questions.length}`);
  return questions.length;
}

