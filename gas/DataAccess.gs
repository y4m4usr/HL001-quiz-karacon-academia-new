/** 出題：master → E/I/J/K を取得し、
 *  GitHub 上の E_I_J_K_[lens|samune].jpg を参照（X=レンズのみ問題で使用）
 *  仕様：3行目〜データ本体／行内に空白セルがあれば除外／E/I/J/K必須
 */
const _isBlank = v => v === null || v === undefined || String(v).trim() === "";

// 必須列が揃っているか
function _validRec(r){
  return !!(r && !['E','I','J','K'].some(k => _isBlank(r[k])));
}

// 例外は“本当に”不正のときだけ
function _ck(r){
  if (!_validRec(r)) throw new Error('ck(): invalid record');
  return [r.E,r.I,r.J,r.K].join("|");
}

// 右側パディング付の範囲取得
function _values_(sh, startRow, lastColIndex){
  const lastRow = sh.getLastRow();
  if (lastRow < startRow) return [];
  const raw = sh.getRange(startRow, 1, lastRow-(startRow-1), lastColIndex).getValues();
  // 各行を lastColIndex 長に揃える
  return raw.map(row => Array.isArray(row)
    ? (row.length < lastColIndex ? row.concat(Array(lastColIndex - row.length).fill("")) : row)
    : Array(lastColIndex).fill(""));
}

// master 読み取り：行内空白（ALまで評価）を厳格チェック＋必須列チェック
function readMaster_(){
  const sh = _open_(CFG.SHEET_IDS.MASTER, CFG.SHEETS.MASTER);
  const v  = _values_(sh, CFG.LAYOUT.MASTER.START_ROW, CFG.LAYOUT.MASTER.LAST_COL_INDEX);
  const C  = CFG.COLS; const rows=[];
  for (let r of v){
    if (CFG.STRICT?.ROW_MUST_BE_FULL && r.some(_isBlank)) continue;
    const rec = {
      E:r[C.E-1], I:r[C.I-1], J:r[C.J-1], K:r[C.K-1],
      P:r[C.P-1], Q:r[C.Q-1], R:r[C.R-1], W:r[C.W-1], X:r[C.X-1]
    };
    if (!_validRec(rec)) continue;
    rows.push(rec);
  }
  return rows;
}

// pickWrongAnswers_ / items_ の入口でも保険をかける
function pickWrongAnswers_(correct, pool, catMap, n){
  if (!_validRec(correct)) return [];
  const corr = _ck(correct), words = catMap.get(`${correct.I}|${correct.J}`)||[];
  let cands = pool.filter(r=>{
    if (!_validRec(r)) return false;
    if (_ck(r)===corr) return false;
    const c = catMap.get(`${r.I}|${r.J}`)||[];
    return c.length && words.some(w=>c.includes(w));
  }).sort(()=>Math.random()-0.5);
  // ...（既存の同ブランド→全体フォールバックはそのまま）
  // 省略
}

function items_(){
  let pool = readMaster_().filter(_validRec); // 念のため再検証
  // ...（既存ロジックのまま）
}

const _isBlank = v => v === null || v === undefined || String(v).trim() === "";

function _validRec(r){
  if (!r || typeof r !== 'object') return false;
  return !['E','I','J','K'].some(k => _isBlank(r[k]));
}
function _ck(r){
  if (!_validRec(r)) throw new Error('ck(): invalid record');
  return [r.E,r.I,r.J,r.K].join("|");
}

function _open_(id, name){
  const sh = SpreadsheetApp.openById(id).getSheetByName(name);
  if (!sh) throw new Error(`sheet not found: ${name}`);
  return sh;
}
function _values_(sh, startRow, lastColIndex){
  const lastRow = sh.getLastRow();
  if (lastRow < startRow) return [];
  return sh.getRange(startRow, 1, lastRow-(startRow-1), lastColIndex).getValues();
}

// master（厳格）：行内空白→除外、E/I/J/K 必須
function readMaster_(){
  const sh = _open_(CFG.SHEET_IDS.MASTER, CFG.SHEETS.MASTER);
  const v  = _values_(sh, CFG.LAYOUT.MASTER.START_ROW, CFG.LAYOUT.MASTER.LAST_COL_INDEX);
  const C  = CFG.COLS; const rows=[]; const needLen = CFG.LAYOUT.MASTER.LAST_COL_INDEX;

  for (let r of v){
    if (!Array.isArray(r)) continue;
    if (r.length < needLen) r = r.concat(Array(needLen - r.length).fill(""));
    if (CFG.STRICT.ROW_MUST_BE_FULL && r.some(_isBlank)) continue; // 絶対条件
    const rec = {
      E:r[C.E-1], I:r[C.I-1], J:r[C.J-1], K:r[C.K-1],
      P:r[C.P-1], Q:r[C.Q-1], R:r[C.R-1]
    };
    if (!_validRec(rec)) continue;
    rows.push(rec);
  }
  return rows;
}

// カラーカテゴリ（B=I, C=J, F=カテゴリ(色語CSV)）
function readCategories_(){
  const sh = _open_(CFG.SHEET_IDS.CATEGORY, CFG.SHEETS.CATEGORY);
  const v  = _values_(sh, CFG.LAYOUT.CATEGORY.START_ROW, CFG.LAYOUT.CATEGORY.LAST_COL_INDEX);
  const B=1, C=2, F=5; const map=new Map();

  for (let r of v){
    if (!Array.isArray(r)) continue;
    const needLen = CFG.LAYOUT.CATEGORY.LAST_COL_INDEX;
    if (r.length < needLen) r = r.concat(Array(needLen - r.length).fill(""));
    if (CFG.STRICT.ROW_MUST_BE_FULL && r.some(_isBlank)) continue;

    const I=String(r[B]||"").trim(), J=String(r[C]||"").trim();
    const colors = String(r[F]||"").split(/[,\u3001\uFF0C\u30FB\/／|]+/).map(s=>s.trim()).filter(Boolean);
    if (!I||!J||!colors.length) continue;
    map.set(`${I}|${J}`, colors);
  }
  return map;
}

// 誤答3件（カテゴリ一致→同ブランド→全体）
function pickWrongAnswers_(correct, pool, catMap, n){
  if (!_validRec(correct)) return [];
  const corr = _ck(correct), words = catMap.get(`${correct.I}|${correct.J}`)||[];

  let cands = pool.filter(r=>{
    if (!_validRec(r)) return false;
    if (_ck(r)===corr) return false;
    const c = catMap.get(`${r.I}|${r.J}`)||[];
    return c.length && words.some(w=>c.includes(w));
  }).sort(()=>Math.random()-0.5);

  const picked=[];
  for(const r of cands){ if(picked.length<n) picked.push(r); }
  if (picked.length<n){
    const sameBrand = pool.filter(r=>_validRec(r) && _ck(r)!==corr && r.I===correct.I && r.J!==correct.J);
    for(const r of sameBrand){ if(picked.length<n && !picked.includes(r)) picked.push(r); }
  }
  if (picked.length<n){
    const any = pool.filter(r=>_validRec(r) && _ck(r)!==corr);
    for(const r of any){ if(picked.length<n && !picked.includes(r)) picked.push(r); }
  }
  return picked.slice(0,n);
}

// GitHub上のファイル名（E_I_J_K_[lens|samune].jpg）を組み立て
function buildImageUrl_(rec, kind /* 'lens'|'samune' */){
  const dir = (kind==='samune') ? CFG.GITHUB.PATHS.SAMUNE_DIR : CFG.GITHUB.PATHS.LENS_DIR;
  const fname = `${rec.E}_${rec.I}_${rec.J}_${rec.K}_${kind}.jpg`;
  return toRaw_(`${dir}/${fname}`);
}

function makeQuestion_(rec, wrongs){
  // レンズ画像（raw→CDNフォールバック）
  let img = buildImageUrl_(rec, 'lens');
  try{
    const res = UrlFetchApp.fetch(img, {muteHttpExceptions:true, followRedirects:true});
    if (res.getResponseCode()>=400) img = toCdnFallback_(img);
  }catch(_){ img = toCdnFallback_(img); }

  const options = [
    {label:`${rec.I} / ${rec.J}`, isCorrect:true},
    ...wrongs.map(w=>({label:`${w.I} / ${w.J}`, isCorrect:false}))
  ].sort(()=>Math.random()-0.5);

  return {
    qid:`CK:${_ck(rec)}`,
    image: img, // ← これを index.html で setQuestionImage(q.image) で表示
    specs:{DIA:rec.P, G_DIA:rec.Q, BC:rec.R},
    correct:{E:rec.E, I:rec.I, J:rec.J, K:rec.K},
    options
  };
}

function items_(){
  let pool = readMaster_();
  pool = pool.filter(_validRec); // 最後の関所
  const cats = readCategories_();

  const qs=[];
  for (const r of pool.sort(()=>Math.random()-0.5)){
    if (qs.length>=10) break;
    const ws = pickWrongAnswers_(r, pool, cats, 3);
    if (ws.length<3) continue;
    qs.push(makeQuestion_(r, ws));
  }
  if (qs.length<4) throw new Error('クイズを作成するのに十分なデータがありません（最低4件必要です）。');

  return ContentService.createTextOutput(JSON.stringify({ok:true, items:qs}))
    .setMimeType(ContentService.MimeType.JSON);
}
function debug_findInvalidMasterRow_(){
  const sh = _open_(CFG.SHEET_IDS.MASTER, CFG.SHEETS.MASTER);
  const v  = _values_(sh, CFG.LAYOUT.MASTER.START_ROW, CFG.LAYOUT.MASTER.LAST_COL_INDEX);
  const C  = CFG.COLS;
  for (let i=0;i<v.length;i++){
    const r = v[i];
    const rec = {E:r[C.E-1], I:r[C.I-1], J:r[C.J-1], K:r[C.K-1]};
    if (!_validRec(rec)) {
      const rowNum = CFG.LAYOUT.MASTER.START_ROW + i;
      Logger.log(`Invalid at row#${rowNum}: E=${rec.E}, I=${rec.I}, J=${rec.J}, K=${rec.K}`);
      return {row: rowNum, rec};
    }
  }
  Logger.log('No invalid rows — all good.');
  return null;
}
