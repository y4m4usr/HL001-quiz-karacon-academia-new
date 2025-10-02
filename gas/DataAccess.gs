/** 出題ロジック最終版（簡素化仕様・救済モード込み） */

const _isBlank = v => v === null || v === undefined || String(v).trim() === "";
function _validRec(r){ return r && !['E','I','J','K'].some(k => _isBlank(r[k])); }
function _ck(r){ if(!_validRec(r)) throw new Error('ck(): invalid'); return [r.E,r.I,r.J,r.K].join("|"); }

function _open_(id, name){
  const sh = SpreadsheetApp.openById(id).getSheetByName(name);
  if (!sh) throw new Error(`sheet not found: ${name}`);
  return sh;
}
function _values_(sh, startRow, lastColIndex){
  const lastRow = sh.getLastRow(); if (lastRow < startRow) return [];
  const lastCol = Math.min(lastColIndex, sh.getLastColumn());
  return sh.getRange(startRow, 1, lastRow-(startRow-1), lastCol).getValues();
}

/* ---------- master 読み取り ---------- */
function readMasterStrict_(){
  const sh = _open_(CFG.SHEET_IDS.MASTER, CFG.SHEETS.MASTER);
  const vs = _values_(sh, CFG.LAYOUT.MASTER.START_ROW, CFG.LAYOUT.MASTER.LAST_COL_INDEX);
  const C  = CFG.COLS; const rows=[];
  for (let r of vs){
    if (!Array.isArray(r)) continue;
    if (CFG.STRICT.ROW_MUST_BE_FULL && r.some(_isBlank)) continue; // 行内空白→除外
    const rec = {E:r[C.E-1], I:r[C.I-1], J:r[C.J-1], K:r[C.K-1], P:r[C.P-1], Q:r[C.Q-1], R:r[C.R-1]};
    if (!_validRec(rec)) continue;
    rows.push(rec);
  }
  return rows;
}
function readMasterRequiredOnly_(){
  const sh = _open_(CFG.SHEET_IDS.MASTER, CFG.SHEETS.MASTER);
  const vs = _values_(sh, CFG.LAYOUT.MASTER.START_ROW, CFG.LAYOUT.MASTER.LAST_COL_INDEX);
  const C  = CFG.COLS; const rows=[];
  for (let r of vs){
    if (!Array.isArray(r)) continue;
    const rec = {E:r[C.E-1], I:r[C.I-1], J:r[C.J-1], K:r[C.K-1], P:r[C.P-1], Q:r[C.Q-1], R:r[C.R-1]};
    if (!_validRec(rec)) continue;          // E/I/J/K 必須
    // X 列（レンズURL）は元マスターのDrive URLだが、表示は命名規則から組むため必須チェックのみ
    rows.push(rec);
  }
  return rows;
}

/* ---------- カラーカテゴリ（B=I, C=J, F=カテゴリCSV） ---------- */
function readCategories_(){
  const sh = _open_(CFG.SHEET_IDS.CATEGORY, CFG.SHEETS.CATEGORY);
  const vs = _values_(sh, CFG.LAYOUT.CATEGORY.START_ROW, CFG.LAYOUT.CATEGORY.LAST_COL_INDEX);
  const B=CFG.COLS.CAT_B-1, C=CFG.COLS.CAT_C-1, F=CFG.COLS.CAT_F-1;
  const map=new Map();
  for (const r of vs){
    if (!Array.isArray(r)) continue;
    const brand = String(r[B]||"").trim();
    const color = String(r[C]||"").trim();
    const cats  = String(r[F]||"").split(/[,\u3001\uFF0C\u30FB\/／|]+/).map(s=>s.trim()).filter(Boolean);
    if (!brand || !color || !cats.length) continue;
    map.set(`${brand}|${color}`, cats);
  }
  return map;
}

/* ---------- 画像URL ---------- */
function buildImageUrl_(rec, kind/* lens|samune */){
  const dir = (kind==='samune') ? CFG.GITHUB.PATHS.SAMUNE_DIR : CFG.GITHUB.PATHS.LENS_DIR;
  const fname = `${rec.E}_${rec.I}_${rec.J}_${rec.K}_${kind}.jpg`;
  return toRaw_(`${dir}/${fname}`);
}
function urlOkOrCdn_(rawUrl){
  try{
    const res = UrlFetchApp.fetch(rawUrl, {muteHttpExceptions:true, followRedirects:true});
    const code = res.getResponseCode();
    if (code>=200 && code<400) return rawUrl;
  }catch(e){}
  const cdn = toCdnFallback_(rawUrl);
  try{
    const res2 = UrlFetchApp.fetch(cdn, {muteHttpExceptions:true, followRedirects:true});
    const code2 = res2.getResponseCode();
    if (code2>=200 && code2<400) return cdn;
  }catch(e){}
  return "";
}

/* ---------- 誤答抽出 ---------- */
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
    const sameBrand = pool.filter(r=>_ck(r)!==corr && r.I===correct.I && r.J!==correct.J);
    for(const r of sameBrand){ if(picked.length<n && !picked.includes(r)) picked.push(r); }
  }
  if (picked.length<n){
    const any = pool.filter(r=>_ck(r)!==corr);
    for(const r of any){ if(picked.length<n && !picked.includes(r)) picked.push(r); }
  }
  return picked.slice(0,n);
}

/* ---------- 問題生成（配列を返す） ---------- */
function generateQuestions_(){
  const pool = (CFG.STRICT.ALLOW_REQUIRED_ONLY ? readMasterRequiredOnly_() : readMasterStrict_());
  const cats = readCategories_();
  const qs   = [];
  for (const r of pool.sort(()=>Math.random()-0.5)){
    if (qs.length>=10) break;
    const img = urlOkOrCdn_( buildImageUrl_(r,'lens') );
    if (!img) continue;                 // 画像不成立はスキップ
    const ws = pickWrongAnswers_(r, pool, cats, 3);
    if (ws.length<3) continue;
    const options = [
      {label:`${r.I} / ${r.J}`, isCorrect:true},
      ...ws.map(w=>({label:`${w.I} / ${w.J}`, isCorrect:false}))
    ].sort(()=>Math.random()-0.5);
    qs.push({
      qid:`CK:${_ck(r)}`, image: img,
      specs:{DIA:r.P, G_DIA:r.Q, BC:r.R},
      correct:{E:r.E,I:r.I,J:r.J,K:r.K},
      options
    });
  }
  return qs;
}

/* ---------- Web API ---------- */
function items_(){
  const qs = generateQuestions_();
  if (qs.length<4) throw new Error('クイズを作成するのに十分なデータがありません（最低4件必要です）。');
  return ContentService.createTextOutput(JSON.stringify({ok:true, items:qs}))
    .setMimeType(ContentService.MimeType.JSON);
}
function health_(){
  let strict_rows=0, req_only_rows=0, cat_pairs=0, img_status=-1, note="";
  try{ strict_rows   = readMasterStrict_().length; }catch(e){ note+="masterS:"+e.message+";"; }
  try{ req_only_rows = readMasterRequiredOnly_().length; }catch(e){ note+="masterR:"+e.message+";"; }
  try{ cat_pairs     = readCategories_().size; }catch(e){ note+="cat:"+e.message+";"; }
  try{
    const pool = (strict_rows? readMasterStrict_() : readMasterRequiredOnly_());
    if (pool.length){
      let raw = buildImageUrl_(pool[0], 'lens');
      let res = UrlFetchApp.fetch(raw, {muteHttpExceptions:true, followRedirects:true});
      img_status = res.getResponseCode();
      if (img_status>=400){
        raw = toCdnFallback_(raw);
        res = UrlFetchApp.fetch(raw, {muteHttpExceptions:true, followRedirects:true});
        img_status = res.getResponseCode();
      }
    }
  }catch(e){ note+="img:"+e.message+";"; }
  const ok = ((strict_rows>0 || req_only_rows>0) && img_status>=200 && img_status<400);
  return ContentService.createTextOutput(JSON.stringify({ ok, stats:{strict_rows,req_only_rows,cat_pairs,img_status}, note }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Router（既存doGetと重複定義しない） ---------- */
function doGet(e){
  const p = e && e.parameter || {};
  if (p.action==='items')        return items_();
  if (p.action==='health')       return health_();
  if (p.action==='healthDetail') return healthDetail_();
  // ここに index を返す処理（既存の index_() があるならそちらを呼ぶ）
  if (typeof index_ === 'function') return index_();
  return ContentService.createTextOutput(JSON.stringify({ok:false,error:'unknown action'}))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- 詳細ヘルス（任意の可視化用） ---------- */
function healthDetail_(){
  const full = readMasterStrict_();
  const req  = readMasterRequiredOnly_();
  const cats = readCategories_();
  return ContentService.createTextOutput(JSON.stringify({
    ok:true,
    strict_rows: full.length,
    req_only_rows: req.length,
    cat_pairs: cats.size
  })).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- manual_fix_queue.csv を完全停止（Driveを触らない） ---------- */
function exportManualFixQueueCsv_(){ /* no-op（呼ばれても何もしない）*/ }
