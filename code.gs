/**
 * ===================================================================
 * カラコンクイズアカデミア - サーバーサイドメインスクリプト
 * ===================================================================
 * このファイルは、Webアプリのバックエンド処理のすべてを担います。
 * - 設定管理 (CONFIG)
 * - Webページ表示 (doGet)
 * - フロントエンドからのリクエスト受付 (getQuestions)
 * - クイズ問題の生成ロジック
 * - ユーティリティ関数
 */

// --- 設定ここから ---
// スクリプトの動作に必要な設定は、すべてこの CONFIG オブジェクトにまとめています。
const CONFIG = {
  // 読み込むスプレッドシートのID (テスト用シート)
  SPREADSHEET_ID: '12dYxk29Tj4Xv4E_VDdXnCPclQK72XZrSabdhi2SM_0Y',
  
  // シート名
  MASTER_SHEET: 'master',
  CATEGORY_SHEET: 'カラーカテゴリ',
  
  // データの開始行
  DATA_START_ROW: 3,

  // 列番号 (1始まり)
  COL_M: { SERIES: 9, COLOR: 10, IMG: 24, DIA: 16, GDIA: 17, BC: 18, COMMENT: 38 },
  COL_C: { SERIES: 2, COLOR: 3, CATEGORIES: 6 },
  
  // カラー類似度判定用のキーワード
  COLOR_TOKENS: ['ブラウン','ライトブラウン','ダークブラウン','グレー','グレイ','ブルー','グリーン','オリーブ','ピンク','パープル','バイオレット','ヘーゼル','ブラック','ベージュ','アッシュ','レッド','オレンジ','アンバー','チャコール','ネイビー'],
  
  // 誤答選択時に使用するカラー類似度の閾値
  COLOR_SIM_THRESHOLD: 0.15
};
// --- 設定ここまで ---


/**
 * Webアプリの初期表示を行う関数 (必須)
 * @returns {HtmlOutput} 描画するHTMLページ
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Quiz☆カラコンアカデミア')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * フロントエンドから呼び出されるAPI関数
 * クイズの問題セットを生成して返します。
 * @param {object} params パラメータ (例: { count: 10 })
 * @returns {Array} 問題オブジェクトの配列
 */
function getQuestions(params){
  params = params || {};
  const count = Math.max(1, Math.min(20, Number(params.count || 10)));
  
  // スプレッドシートを開く
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  
  const shM = ss.getSheetByName(CONFIG.MASTER_SHEET);
  if (!shM) throw new Error(`masterシートが見つかりません: "${CONFIG.MASTER_SHEET}"`);

  const shC = ss.getSheetByName(CONFIG.CATEGORY_SHEET);
  if (!shC) throw new Error(`カラーカテゴリ用シートが見つかりません: "${CONFIG.CATEGORY_SHEET}"`);

  // データ範囲を計算
  const startRow = CONFIG.DATA_START_ROW;
  const lastRowM = shM.getLastRow();
  const numRowsM = lastRowM >= startRow ? lastRowM - startRow + 1 : 0;

  const lastRowC = shC.getLastRow();
  const numRowsC = lastRowC >= startRow ? lastRowC - startRow + 1 : 0;

  // データを一括読み込み
  const M = numRowsM > 0 ? shM.getRange(startRow, 1, numRowsM, shM.getLastColumn()).getValues() : [];
  const C = numRowsC > 0 ? shC.getRange(startRow, 1, numRowsC, shC.getLastColumn()).getValues() : [];

  // カテゴリデータを高速に検索できるようMap形式に変換
  const catMap = buildCategoryMap_(C);

  // masterデータから出題候補をリストアップ
  const candidates = buildCandidates_(M, catMap);
  if (!candidates.length) {
    throw new Error('出題候補が0件です。masterシートとカラーカテゴリシートの整合性を確認してください。');
  }

  // 候補をシャッフル
  shuffle_(candidates);

  // 指定された問題数だけ問題を生成
  const out = [];
  const used = new Set(); 
  for (let i=0; i < candidates.length && out.length < count; i++){
    const cand = candidates[i];
    if (used.has(cand.key)) continue;
    
    const q = buildQuestion_(cand, catMap);
    if (q){
      out.push(q);
      used.add(cand.key);
    }
  }
  return out;
}


// ===================================================================
// 内部ヘルパー関数 ( '_' で終わる関数は内部でのみ使用します )
// ===================================================================

/**
 * カテゴリシートのデータをMap形式に変換します。
 * @param {Array<Array<string>>} C_values カテゴリシートのデータ
 * @returns {Map} "シリーズ｜カラー"をキーとしたカテゴリ情報のMap
 */
function buildCategoryMap_(C_values) {
  const catMap = new Map();
  for (const row of C_values){
    const series = s_(row[CONFIG.COL_C.SERIES-1]);
    const color  = s_(row[CONFIG.COL_C.COLOR-1]);
    if (!series || !color) continue;
    
    const key = `${series}｜${color}`;
    const cats = parseCats_(row[CONFIG.COL_C.CATEGORIES-1]);
    
    if (!catMap.has(key)) {
      catMap.set(key, { series, color, cats });
    } else {
      const exist = catMap.get(key);
      exist.cats = new Set([...exist.cats, ...cats]);
    }
  }
  return catMap;
}

/**
 * Masterシートのデータから出題可能な候補を抽出します。
 * @param {Array<Array<string>>} M_values Masterシートのデータ
 * @param {Map} catMap カテゴリ情報のMap
 * @returns {Array} 出題候補のオブジェクト配列
 */
function buildCandidates_(M_values, catMap) {
  const candidates = [];
  for (const row of M_values){
    const series = s_(row[CONFIG.COL_M.SERIES-1]);
    const color  = s_(row[CONFIG.COL_M.COLOR-1]);
    const img    = s_(row[CONFIG.COL_M.IMG-1]);
    if (!series || !color || !img) continue;

    const key = `${series}｜${color}`;
    if (catMap.has(key)) {
        candidates.push({ series, color, key, img, mrow: row });
    }
  }
  return candidates;
}


/**
 * 1問分の問題オブジェクトを生成します。
 * @param {object} cand 正解の候補情報
 * @param {Map} catMap 全商品のカテゴリ情報
 * @returns {object|null} 生成された問題オブジェクト、または失敗時にnull
 */
function buildQuestion_(cand, catMap){
  const key = cand.key;
  const entry = catMap.get(key);
  const correctCats = entry ? entry.cats : new Set();
  const correctColor = cand.color;

  // 誤答候補をプール
  let pool = [];
  for (const [k, v] of catMap.entries()){
    if (k === key) continue; // 正解と同じ商品は除外
    if (!hasInter_(correctCats, v.cats)) continue; // カテゴリが1つも一致しないものは除外
    
    const sim = colorSim_(correctColor, v.color);
    if (sim < CONFIG.COLOR_SIM_THRESHOLD) continue; // 色の印象が違いすぎるものは除外
    
    pool.push({ key:k, series:v.series, color:v.color, sim });
  }
  
  // 類似度順にソート
  pool.sort((a,b)=> (b.sim-a.sim) || (Math.random()-0.5));

  // 誤答を3つ選ぶ
  let chosen = pool.slice(0, 3);

  // もし誤答が3つに満たない場合、条件を緩めて補充する
  if (chosen.length < 3){
    const chosenKeys = new Set(chosen.map(c => c.key));
    chosenKeys.add(key);
    
    // 条件緩和1: カテゴリ一致のみ (色の類似度は問わない)
    for (const [k,v] of catMap.entries()){
        if (chosen.length >= 3) break;
        if (chosenKeys.has(k)) continue;
        if (hasInter_(correctCats, v.cats)){
            chosen.push({ key:k, series:v.series, color:v.color, sim:0 });
            chosenKeys.add(k);
        }
    }
  }
  if (chosen.length < 3){
    const chosenKeys = new Set(chosen.map(c => c.key));
    chosenKeys.add(key);

    // 条件緩和2: 全商品からランダム (正解以外)
     for (const [k,v] of catMap.entries()){
        if (chosen.length >= 3) break;
        if (chosenKeys.has(k)) continue;
        chosen.push({ key:k, series:v.series, color:v.color, sim:0 });
        chosenKeys.add(k);
    }
  }
  
  // それでも3つ未満なら問題生成失敗
  if (chosen.length < 3) return null;

  // 選択肢を作成
  const options = [key, chosen[0].key, chosen[1].key, chosen[2].key];
  shuffle_(options);

  // 返却するデータを整形
  const imgUrl = normalizeDriveUrl_(cand.img);
  const m = cand.mrow;
  const hint1 = hint1_(m[CONFIG.COL_M.DIA-1], m[CONFIG.COL_M.GDIA-1], m[CONFIG.COL_M.BC-1]);
  const hint2 = s_(m[CONFIG.COL_M.COMMENT-1]) || null;

  return {
    questionId: 'q_' + Utilities.getUuid(),
    prompt: 'このカラコンの名前は？',
    imgL: imgUrl,
    imgR: imgUrl,
    options: options,
    correctAnswer: key,
    hint1, 
    hint2
  };
}


// ===================================================================
// 汎用ユーティリティ関数
// ===================================================================

function s_(v){ return (v===null || v===undefined) ? '' : String(v).trim(); }

function parseCats_(v){
  const s = s_(v); if (!s) return new Set();
  return new Set(s.split(/[、,\/|\s・;；]+/).map(t=>t.trim()).filter(Boolean));
}

function hasInter_(a,b){
  if (!a || !b) return false;
  for (const x of a) if (b.has(x)) return true;
  return false;
}

function shuffle_(arr){
  for (let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i], arr[j]] = [arr[j], arr[i]]; // ES6 swap
  }
}

function hint1_(dia, gdia, bc){
  const parts=[]; dia = s_(dia); gdia=s_(gdia); bc=s_(bc);
  if (dia)  parts.push('DIA: '+dia);
  if (gdia) parts.push('G.DIA: '+gdia);
  if (bc)   parts.push('BC: '+bc);
  return parts.length? parts.join(' / '): null;
}

function normalizeDriveUrl_(url){
  const s = s_(url); if (!s) return null;
  if (/\/uc\?export=view&/.test(s)) return s;
  let m = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)\//);
  if (m) return 'https://drive.google.com/uc?export=view&id=' + m[1];
  m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return 'https://drive.google.com/uc?export=view&id=' + m[1];
  return null; // 不正なURLはnullを返す
}

function colorSim_(a,b){
  const na = normColor_(a), nb = normColor_(b);
  if (!na || !nb) return 0;
  const famA = CONFIG.COLOR_TOKENS.filter(t=>na.includes(t));
  const famB = CONFIG.COLOR_TOKENS.filter(t=>nb.includes(t));
  if (famA.length && famB.length && !famA.some(x => famB.includes(x))) {
    return 0;
  }
  const A = bigrams_(na), B = bigrams_(nb);
  if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach(g=>{ if (B.has(g)) inter++; });
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

function normColor_(s){ return String(s||'').replace(/[()\\\[\\\]{}!！?？・･\-\s＿_－—〜~､、，,．.\.／/\\]/g,'').toLowerCase(); }

function bigrams_(s){ const set=new Set(); for (let i=0;i<s.length-1;i++) set.add(s.slice(i,i+2)); return set; }
