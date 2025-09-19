/**
 * @OnlyCurrentDoc
 *
 * カラコンクイズアカデミア サーバーサイドメインスクリプト v2.4 (Base64画像プロキシ)
 * 機能：
 * - APIのエントリーポイント (doGet, getQuestions)
 * - スプレッドシートからのデータ読み込み
 * - クイズ問題の生成ロジック
 * - 画像をBase64文字列に変換して返す、より堅牢な画像プロキシ (★最終解決策)
 */

// ===================================================================
// 設定 (CONFIG)
// ===================================================================
const CONFIG = {
  SPREADSHEET_ID: '12dYxk29Tj4Xv4E_VDdXnCPclQK72XZrSabdhi2SM_0Y', 
  MASTER_SHEET_NAME: 'master',
  CATEGORY_SHEET_NAME: 'カラーカテゴリ',
  DATA_START_ROW: 3, 
  COL_M: { SERIES: 9, COLOR: 10, IMG: 24, DIA: 16, GDIA: 17, BC: 18, COMMENT: 38 },
  COL_C: { SERIES: 2, COLOR: 3, CATEGORIES: 6 },
  COLOR_TOKENS: ['ブラウン','ライトブラウン','ダークブラウン','グレー','グレイ','ブルー','グリーン','オリーブ','ピンク','パープル','バイオレット','ヘーゼル','ブラック','ベージュ','アッシュ','レッド','オレンジ','アンバー','チャコール','ネイビー'],
  COLOR_SIM_THRESHOLD: 0.15
};

// ===================================================================
// Webアプリ エントリーポイント
// ===================================================================
function doGet(e) {
  // ★ Base64画像プロキシとしてのリクエストを処理
  if (e && e.parameter && e.parameter.fileId) {
    return handleGetImageAsBase64_(e.parameter.fileId);
  }

  // 通常のHTMLページ表示
  return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('Quiz☆カラコンアカデミア')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ★ 新設：画像IDを受け取り、Base64エンコードされたJSONを返すハンドラー
function handleGetImageAsBase64_(fileId) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'base64_' + fileId;
  const cached = cache.get(cacheKey);

  if (cached) {
    return ContentService.createTextOutput(cached)
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    const blob = DriveApp.getFileById(fileId).getBlob();
    const base64 = Utilities.base64Encode(blob.getBytes());
    const mimeType = blob.getContentType();
    
    const response = {
      success: true,
      data: `data:${mimeType};base64,${base64}`
    };
    
    const jsonResponse = JSON.stringify(response);
    cache.put(cacheKey, jsonResponse, 21600); // 6時間キャッシュ

    return ContentService.createTextOutput(jsonResponse)
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    console.error("Base64 Image proxy error for fileId " + fileId + ": " + err.toString());
    const errorResponse = JSON.stringify({ success: false, error: err.message });
    return ContentService.createTextOutput(errorResponse)
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// ===================================================================
// フロントエンドから呼ばれるメイン関数
// ===================================================================
function getQuestions(params) {
  try {
    const count = Math.max(1, Math.min(20, (params && params.count) || 10));

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const shM = ss.getSheetByName(CONFIG.MASTER_SHEET_NAME);
    const shC = ss.getSheetByName(CONFIG.CATEGORY_SHEET_NAME);

    if (!shM) throw new Error('「master」シートが見つかりません。');
    if (!shC) throw new Error('「カラーカテゴリ」シートが見つかりません。');

    const masterData = shM.getRange(CONFIG.DATA_START_ROW, 1, shM.getLastRow() - CONFIG.DATA_START_ROW + 1, shM.getLastColumn()).getValues();
    const categoryData = shC.getRange(CONFIG.DATA_START_ROW, 1, shC.getLastRow() - CONFIG.DATA_START_ROW + 1, shC.getLastColumn()).getValues();
    
    const catMap = buildCategoryMap_(categoryData);
    const candidates = buildCandidates_(masterData, catMap);
    if (candidates.length < 4) {
      throw new Error('クイズを作成するのに十分なデータがありません（最低4件必要です）。');
    }

    shuffle_(candidates);
    
    const questions = [];
    const usedKeys = new Set();
    for (const cand of candidates) {
      if (questions.length >= count) break;
      if (usedKeys.has(cand.key)) continue;
      
      const q = buildQuestion_(cand, candidates);
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

// ===================================================================
// 内部ヘルパー関数 (変更なし)
// ===================================================================
function buildQuestion_(correctCand, allCandidates) {
  const distractors = [];
  const allCandidatesShuffled = shuffle_([...allCandidates]);
  
  for (const cand of allCandidatesShuffled) {
    if (distractors.length >= 3) break;
    if (cand.key === correctCand.key) continue;
    
    const hasIntersection = [...correctCand.cats].some(cat => cand.cats.has(cat));
    if (!hasIntersection) continue;
    
    const sim = colorSim_(correctCand.color, cand.color);
    if (sim < CONFIG.COLOR_SIM_THRESHOLD) continue;
    
    distractors.push(cand.key);
  }

  if (distractors.length < 3) {
      for (const cand of allCandidatesShuffled) {
          if (distractors.length >= 3) break;
          if (cand.key === correctCand.key || distractors.includes(cand.key)) continue;
          distractors.push(cand.key);
      }
  }
  
  if (distractors.length < 3) return null;

  const options = [correctCand.key, ...distractors];
  shuffle_(options);
  
  return {
    questionId: Utilities.getUuid(),
    imgL: imageProxyUrl_(correctCand.img),
    imgR: imageProxyUrl_(correctCand.img),
    options: options,
    correctAnswer: correctCand.key,
    hint1: correctCand.hint1,
    hint2: correctCand.hint2
  };
}

function imageProxyUrl_(driveUrl) {
  const s = String(driveUrl || '').trim();
  if (!s) return null;
  const match = s.match(/\/d\/([a-zA-Z0-9_-]+)/) || s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    const fileId = match[1];
    return ScriptApp.getService().getUrl() + '?fileId=' + fileId;
  }
  return null;
}

function buildCategoryMap_(categoryData){const catMap=new Map();categoryData.forEach(row=>{const series=s_(row[CONFIG.COL_C.SERIES-1]);const color=s_(row[CONFIG.COL_C.COLOR-1]);if(!series||!color)return;const key=`${series}｜${color}`;const cats=new Set(s_(row[CONFIG.COL_C.CATEGORIES-1]).split(/[、,/\s]+/));if(catMap.has(key)){const existing=catMap.get(key);cats.forEach(c=>existing.cats.add(c))}else{catMap.set(key,{series,color,cats})}});return catMap}
function buildCandidates_(masterData,catMap){const candidates=[];masterData.forEach(row=>{const series=s_(row[CONFIG.COL_M.SERIES-1]);const color=s_(row[CONFIG.COL_M.COLOR-1]);const img=s_(row[CONFIG.COL_M.IMG-1]);if(!series||!color||!img)return;const key=`${series}｜${color}`;if(!catMap.has(key))return;candidates.push({key:key,series:series,color:color,img:img,cats:catMap.get(key).cats,hint1:`DIA:${s_(row[CONFIG.COL_M.DIA-1])} / G.DIA:${s_(row[CONFIG.COL_M.GDIA-1])} / BC:${s_(row[CONFIG.COL_M.BC-1])}`,hint2:s_(row[CONFIG.COL_M.COMMENT-1])})});return candidates}
function s_(v){return(v===null||v===undefined)?'':String(v).trim()}
function shuffle_(arr){for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}return arr}
function colorSim_(a,b){const na=normColor_(a),nb=normColor_(b);if(!na||!nb)return 0;const famA=CONFIG.COLOR_TOKENS.filter(t=>na.includes(t));const famB=CONFIG.COLOR_TOKENS.filter(t=>nb.includes(t));if(famA.length&&famB.length&&!famA.some(x=>famB.includes(x)))return 0;const bigramsA=new Set(getBigrams_(na));const bigramsB=new Set(getBigrams_(nb));if(!bigramsA.size||!bigramsB.size)return 0;let inter=0;bigramsA.forEach(g=>{if(bigramsB.has(g))inter++});const union=bigramsA.size+bigramsB.size-inter;return union?inter/union:0}
function normColor_(s){return s_(''+s).replace(/[()\[\]{}!！?？・･\-\s＿_－—〜~､、，,．.\.／/\\]/g,'').toLowerCase()}
function getBigrams_(s){const grams=[];for(let i=0;i<s.length-1;i++)grams.push(s.slice(i,i+2));return grams}

