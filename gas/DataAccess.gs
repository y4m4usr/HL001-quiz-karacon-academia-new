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
    Logger.log(`ユニークな「ブランド｜カラー」の組み合わせ数: ${uniqueKeys.size}件`);

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
 * v1.7: 候補リストを作成する際に、画像URLを動的に生成する
 * @param {Array<Array<any>>} masterData - マスタシートの全データ
 * @param {Map<string, object>} catMap - カテゴリデータ
 * @return {Array<object>} 候補オブジェクトの配列
 */
function buildCandidates_(masterData, catMap) {
  const candidates = [];
  const C = COLS.MASTER; // Config.gsから

  masterData.forEach(row => {
    const brand = s_(row[colLetterToIndex_(C.BRAND)]);
    const color = s_(row[colLetterToIndex_(C.COLOR)]);
    const lensUrlFromSheet = s_(row[colLetterToIndex_(C.LENS_URL)]);

    // v1.7: データ完備の商品のみを出題対象とする
    if (!brand || !color || !lensUrlFromSheet) return; 

    const key = `${brand}｜${color}`;
    if (!catMap.has(key)) return;

    const productCode = s_(row[colLetterToIndex_(C.PRODUCT_CODE)]);
    const wearPeriod = s_(row[colLetterToIndex_(C.WEAR_PERIOD)]);

    // v1.7: 新しい命名規則でファイル名を生成
    const imageName = `${productCode}_${sanitizeForUrl_(brand)}_${sanitizeForUrl_(color)}_${sanitizeForUrl_(wearPeriod)}_lens.jpg`;
    const githubUrl = `https://raw.githubusercontent.com/${GITHUB_REPO.OWNER_REPO}/${GITHUB_REPO.BRANCH}/${GITHUB_REPO.LENS_IMAGE_PATH}/${imageName}`;

    candidates.push({
      key: key,
      brand: brand,
      color: color,
      lensUrl: githubUrl, // v1.7: 動的に生成したレンズ画像URL
      thumbUrl: s_(row[colLetterToIndex_(C.THUMB_URL)]), // v1.7: サムネURLはW列をそのまま使用
      cats: catMap.get(key).cats,
      hint1: `DIA:${s_(row[colLetterToIndex_(C.DIA)])} / G.DIA:${s_(row[colLetterToIndex_(C.GDIA)])} / BC:${s_(row[colLetterToIndex_(C.BC)])}`,
      hint2: s_(row[colLetterToIndex_(C.COMMENT)])
    });
  });
  return candidates;
}

/**
 * カテゴリシートのデータから、検索用のMapを生成する
 */
function buildCategoryMap_(categoryData){
  const catMap=new Map();
  categoryData.forEach(row=>{
    const series=s_(row[COL_C.SERIES-1]);
    const color=s_(row[COL_C.COLOR-1]);
    if(!series||!color)return;
    const key=`${series}｜${color}`;
    const cats=new Set(s_(row[COL_C.CATEGORIES-1]).split(/[、,\/\s]+/));
    if(catMap.has(key)){
      const existing=catMap.get(key);
      cats.forEach(c=>existing.cats.add(c))
    }else{
      catMap.set(key,{series,color,cats})
    }
  });
  return catMap
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

/**
 * Pythonのsanitize_filenameと互換性のあるファイル名サニタイズ関数
 */
function sanitizeForUrl_(name) {
  if (!name) return '';
  return name.replace(/　/g, ' ').replace(/[\\/:*?"<>|]/g, '_');
}

/**
 * 値をトリムして文字列に変換する
 */
function s_(v){return(v===null||v===undefined)?'':String(v).trim()}

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

    const masterData = shM.getRange(3, 1, shM.getLastRow() - 2, shM.getLastColumn()).getValues();
    const categoryData = shC.getRange(3, 1, shC.getLastRow() - 2, shC.getLastColumn()).getValues();
    
    const catMap = buildCategoryMap_(categoryData);

    const C = COLS.MASTER;

    let totalMasterRows = masterData.length;
    let passedFieldCheck = 0;
    let passedCategoryCheck = 0;
    const validCandidateKeys = new Set();
    
    const discardedForFields = [];
    const discardedForCategory = [];

    masterData.forEach((row, index) => {
      const brand = s_(row[colLetterToIndex_(C.BRAND)]);
      const color = s_(row[colLetterToIndex_(C.COLOR)]);
      const lensUrlFromSheet = s_(row[colLetterToIndex_(C.LENS_URL)]);

      if (!brand || !color || !lensUrlFromSheet) {
        if (discardedForFields.length < 5) { // 最初の5件をサンプルとして記録
          discardedForFields.push(`masterシートの ${index + 3}行目: 必須項目が空です (ブランド: '${brand}', カラー: '${color}', レンズURL: '${lensUrlFromSheet}')`);
        }
        return;
      }
      passedFieldCheck++;

      const key = `${brand}｜${color}`;
      if (!catMap.has(key)) {
        if (discardedForCategory.length < 5) { // 最初の5件をサンプルとして記録
          discardedForCategory.push(`masterシートの ${index + 3}行目: キー「${key}」がカラーカテゴリシートに存在しません。`);
        }
        return;
      }
      passedCategoryCheck++;
      validCandidateKeys.add(key);
    });

    return {
      step1_totalMasterRows: totalMasterRows,
      step2_passedFieldCheck: passedFieldCheck,
      step3_passedCategoryCheck: passedCategoryCheck,
      step4_finalUniqueCandidates: validCandidateKeys.size,
      info_discardedForFields_count: totalMasterRows - passedFieldCheck,
      info_discardedForCategory_count: passedFieldCheck - passedCategoryCheck,
      debug_examples_discardedForFields: discardedForFields,
      debug_examples_discardedForCategory: discardedForCategory,
    };
  } catch (e) {
    return { error: 'デバッグ処理中に予期せぬエラーが発生しました: ' + e.message, stack: e.stack };
  }
}