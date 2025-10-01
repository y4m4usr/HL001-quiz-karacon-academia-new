/** 出題：E/I/J/K を master から取得 → E/I/J 一致で manifest から画像名を解決。X=レンズ、W=サムネを役割固定。*/
const _isBlank = v => v === null || v === undefined || String(v).trim() === "";
const _ck = r => [r.E,r.I,r.J,r.K].join("|");

function _open_(id, name){
  const sh = SpreadsheetApp.openById(id).getSheetByName(name);
  if (!sh) throw new Error(`sheet not found: ${name}`);
  return sh;
}
function _values_(sh, startRow, lastColIndex){
  const lastRow = sh.getLastRow(); if (lastRow < startRow) return [];
  return sh.getRange(startRow, 1, lastRow-(startRow-1), lastColIndex).getValues();
}

function readMaster_(){
  const sh = _open_(CFG.SHEET_IDS.MASTER, CFG.SHEETS.MASTER);
  const v  = _values_(sh, CFG.LAYOUT.MASTER.START_ROW, CFG.LAYOUT.MASTER.LAST_COL_INDEX);
  const C  = CFG.COLS; const rows=[];
  for (const r of v){
    if (CFG.STRICT.ROW_MUST_BE_FULL && r.some(_isBlank)) continue;     // 仕様：空白セルがあれば不採用 :contentReference[oaicite:14]{index=14}
    const rec = {E:r[C.E-1],I:r[C.I-1],J:r[C.J-1],K:r[C.K-1],P:r[C.P-1],Q:r[C.Q-1],R:r[C.R-1]};
    if (['E','I','J','K'].some(k => _isBlank(rec[k]))) continue;
    rows.push(rec);
  }
  return rows;
}

function fetchManifest_(){
  const url = toRaw_(CFG.GITHUB.PATHS.MANIFEST);
  const res = UrlFetchApp.fetch(url, {muteHttpExceptions:true, followRedirects:true});
  if (res.getResponseCode()>=400) throw new Error(`manifest fetch failed: ${res.getResponseCode()}`);
  return JSON.parse(res.getContentText());
}

// GitHub 画像URLを解決（まず raw、失敗時は jsDelivr へ）:contentReference[oaicite:15]{index=15}
function toCdnFallback_(rawUrl){
  return rawUrl.replace(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i,
                        'https://cdn.jsdelivr.net/gh/$1/$2@$3/$4');
}

function resolveImageUrlByKey_(manifest, rec, kind /* 'lens'|'samune' */){
  const key = `${rec.E}|${rec.I}|${rec.J}`;           // 出題時の一致キー（E/I/J）:contentReference[oaicite:16]{index=16}
  const fname = (manifest[kind]||{})[key];
  if (!fname) return ""; // 見つからなければ空（後段で弾く）
  const dir   = (kind==='samune') ? CFG.GITHUB.PATHS.SAMUNE_DIR : CFG.GITHUB.PATHS.LENS_DIR;
  return toRaw_(`${dir}/${fname}`);
}

// 誤答3件の抽出（カテゴリFによる候補→同ブランド→全体 / 省略可：既出スニペットに準拠）
function readCategories_(){
  const sh = _open_(CFG.SHEET_IDS.CATEGORY, CFG.SHEETS.CATEGORY);
  const v  = _values_(sh, CFG.LAYOUT.CATEGORY.START_ROW, CFG.LAYOUT.CATEGORY.LAST_COL_INDEX);
  const B=1, C=2, F=5; const map=new Map();
  for (const r of v){
    if (CFG.STRICT.ROW_MUST_BE_FULL && r.some(_isBlank)) continue;
    const I=String(r[B]||"").trim(), J=String(r[C]||"").trim();
    const colors = String(r[F]||"").split(/[,\u3001\uFF0C\u30FB\/／|]+/).map(s=>s.trim()).filter(Boolean);
    if (!I||!J||!colors.length) continue;
    map.set(`${I}|${J}`, colors);
  }
  return map;
}
function pickWrongAnswers_(correct, pool, catMap, n){
  const corr = _ck(correct), words = catMap.get(`${correct.I}|${correct.J}`)||[];
  let cands = pool.filter(r=>{
    if (_ck(r)===corr) return false;
    const c = catMap.get(`${r.I}|${r.J}`)||[];
    return c.length && words.some(w=>c.includes(w));
  }).sort(()=>Math.random()-0.5);
  const picked=[]; for(const r of cands){ if(picked.length<n) picked.push(r); }
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

function makeQuestion_(manifest, rec, wrongs){
  // 画像（レンズ）：manifest から解決 → raw 200 でなければ jsDelivr
  let img = resolveImageUrlByKey_(manifest, rec, 'lens');
  if (img){
    const res = UrlFetchApp.fetch(img, {muteHttpExceptions:true});
    if (res.getResponseCode()>=400) img = toCdnFallback_(img);
  }
  const options = [
    {label:`${rec.I} / ${rec.J}`, isCorrect:true},
    ...wrongs.map(w=>({label:`${w.I} / ${w.J}`, isCorrect:false}))
  ].sort(()=>Math.random()-0.5);
  return {
    qid:`CK:${_ck(rec)}`, image: img,
    specs:{DIA:rec.P, G_DIA:rec.Q, BC:rec.R},
    correct:{E:rec.E,I:rec.I,J:rec.J,K:rec.K},
    options
  };
}

function items_(){
  const pool = readMaster_();
  const cats = readCategories_();
  const mf   = fetchManifest_();
  const qs   = [];
  for (const r of pool.sort(()=>Math.random()-0.5)){
    if (qs.length>=10) break;
    const ws = pickWrongAnswers_(r, pool, cats, 3);
    // 画像が解決できない正答は出題しない
    const url = resolveImageUrlByKey_(mf, r, 'lens');
    if (!url || ws.length<3) continue;
    qs.push(makeQuestion_(mf, r, ws));
  }
  if (qs.length<4) throw new Error('クイズを作成するのに十分なデータがありません（最低4件必要です）。');
  return ContentService.createTextOutput(JSON.stringify({ok:true, items:qs})).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e){
  const p = e?.parameter||{};
  if (p.action==='items')    return items_();
  if (p.action==='health')   return health_();
  if (p.action==='rankings') return rankings_(p);
  if (p.action==='mystats')  return mystats_(p);
  return ContentService.createTextOutput(JSON.stringify({ok:false,error:'unknown action'}))
    .setMimeType(ContentService.MimeType.JSON);
}

// 送信は POST を推奨（JSON）
function doPost(e){
  try{
    const body = e?.postData?.contents ? JSON.parse(e.postData.contents) : (e?.parameter||{});
    if (body.action==='submit') return submit_(body);
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:'unknown action'}))
      .setMimeType(ContentService.MimeType.JSON);
  }catch(err){
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:String(err)}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
