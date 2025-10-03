/** 防御強化版: ck無効で落とさない / openByIdの診断 / 行パディング */

const _isBlank = v => v === null || v === undefined || String(v).trim() === "";

/** ★絶対にthrowしない ck */
function _ck(r){
  const a = (r && r.E!=null) ? String(r.E).trim() : "";
  const b = (r && r.I!=null) ? String(r.I).trim() : "";
  const c = (r && r.J!=null) ? String(r.J).trim() : "";
  const d = (r && r.K!=null) ? String(r.K).trim() : "";
  return [a,b,c,d].join("|");
}
function _validRec(r){ return r && !['E','I','J','K'].some(k => _isBlank(r[k])); }

/** ★ID未設定/権限不足/存在しない の診断を返すopen */
function _open_(id, name){
  if (!id || /[【】<>]/.test(id)) {
    throw new Error(`Spreadsheet ID が未設定です: CFG.SHEET_IDS.${name===CFG.SHEETS.MASTER?'MASTER':'CATEGORY'}`);
  }
  try {
    const ss = SpreadsheetApp.openById(id);
    const sh = ss.getSheetByName(name);
    if (!sh) throw new Error(`シート名が見つかりません: "${name}"`);
    return sh;
  } catch (e) {
    // より具体的なメッセージに変換
    throw new Error(`openById失敗: id="${id}" / sheet="${name}" / 可能性: ID誤り・権限なし・ゴミ箱・共有外 / 原因: ${e.message}`);
  }
}

function _values_(sh, startRow, lastColIndex){
  const lr = sh.getLastRow();
  if (lr < startRow) return [];
  const lc = Math.min(lastColIndex, sh.getLastColumn());
  return sh.getRange(startRow, 1, lr-(startRow-1), lc).getValues();
}

/* ---- master 読み取り（厳格） ---- */
function readMasterStrict_(){
  const sh = _open_(CFG.SHEET_IDS.MASTER, CFG.SHEETS.MASTER);
  const v  = _values_(sh, CFG.LAYOUT.MASTER.START_ROW, CFG.LAYOUT.MASTER.LAST_COL_INDEX);
  const C  = CFG.COLS; const need = CFG.LAYOUT.MASTER.LAST_COL_INDEX; const rows=[];
  for (let r of v){
    if (!Array.isArray(r)) continue;
    if (r.length < need) r = r.concat(Array(need - r.length).fill("")); // ★右側パディング
    if (CFG.STRICT.ROW_MUST_BE_FULL && r.some(_isBlank)) continue;
    const rec = {E:r[C.E-1], I:r[C.I-1], J:r[C.J-1], K:r[C.K-1], P:r[C.P-1], Q:r[C.Q-1], R:r[C.R-1]};
    if (!_validRec(rec)) continue;
    rows.push(rec);
  }
  return rows;
}

/* ---- master 読み取り（必須列のみ） ---- */
function readMasterRequiredOnly_(){
  const sh = _open_(CFG.SHEET_IDS.MASTER, CFG.SHEETS.MASTER);
  const v  = _values_(sh, CFG.LAYOUT.MASTER.START_ROW, CFG.LAYOUT.MASTER.LAST_COL_INDEX);
  const C  = CFG.COLS; const need = CFG.LAYOUT.MASTER.LAST_COL_INDEX; const rows=[];
  for (let r of v){
    if (!Array.isArray(r)) continue;
    if (r.length < need) r = r.concat(Array(need - r.length).fill(""));
    const rec = {E:r[C.E-1], I:r[C.I-1], J:r[C.J-1], K:r[C.K-1], P:r[C.P-1], Q:r[C.Q-1], R:r[C.R-1]};
    if (!_validRec(rec)) continue;
    rows.push(rec);
  }
  return rows;
}

/* ---- カテゴリ ---- */
function readCategories_(){
  const sh = _open_(CFG.SHEET_IDS.CATEGORY, CFG.SHEETS.CATEGORY);
  const v  = _values_(sh, CFG.LAYOUT.CATEGORY.START_ROW, CFG.LAYOUT.CATEGORY.LAST_COL_INDEX);
  const B=CFG.COLS.CAT_B-1, C=CFG.COLS.CAT_C-1, F=CFG.COLS.CAT_F-1;
  const map = new Map();
  for (const r of v){
    if (!Array.isArray(r)) continue;
    const brand = String(r[B]||"").trim();
    const color = String(r[C]||"").trim();
    const cats  = String(r[F]||"").split(/[,\u3001\uFF0C\u30FB\/／|]+/).map(s=>s.trim()).filter(Boolean);
    if (!brand || !color || !cats.length) continue;
    map.set(`${brand}|${color}`, cats);
  }
  return map;
}
/* ========== GitHub のレンズ画像インデックスを作成（10分キャッシュ） ========== */

function ghList_(dirPath){
  const g = CFG.GITHUB;
  const url = `https://api.github.com/repos/${g.USER}/${g.REPO}/contents/${dirPath}?ref=${g.REF}`;
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions:true, followRedirects:true });
  if (resp.getResponseCode() !== 200) return [];
  return JSON.parse(resp.getContentText()); // [{name, path, download_url, ...}, ...]
}

/** { "E|I|J|K": "https://raw.githubusercontent.com/.../_lens.jpg", ... } */
function buildLensIndex_(){
  const cache = CacheService.getScriptCache();
  const key   = `lensIndex@${CFG.GITHUB.USER}/${CFG.GITHUB.REPO}@${CFG.GITHUB.REF}`;
  const hit   = cache.get(key);
  if (hit) return JSON.parse(hit);

  const list = ghList_(CFG.GITHUB.PATHS.LENS_DIR);
  const map  = {}; // key -> raw url
  for (const it of list){
    const name = it && it.name || "";
    // 例: WN0001_ワナフ_セレングロー_1day_lens.jpg
    if (!/_lens\.jpe?g$/i.test(name)) continue;
    const base   = name.replace(/_lens\.jpe?g$/i, ""); // E_I_J_K
    const parts  = base.split("_");
    if (parts.length !== 4) continue;                  // 命名が想定外なら無視
    const keyCK  = parts.join("|");
    map[keyCK]   = toRaw_(`${CFG.GITHUB.PATHS.LENS_DIR}/${name}`);
  }
  // 10分キャッシュ
  cache.put(key, JSON.stringify(map), 600);
  return map;
}

/* ---- 画像URL ---- */
function buildImageUrl_(rec, kind){
  const dir = (kind==='samune') ? CFG.GITHUB.PATHS.SAMUNE_DIR : CFG.GITHUB.PATHS.LENS_DIR;
  const fname = `${rec.E}_${rec.I}_${rec.J}_${rec.K}_${kind}.jpg`;
  return `${toRaw_(dir)}/${fname}`;
}
function toRaw_(path){ // 補助（Configにも同名がある場合は片方だけ残してOK）
  const g = CFG.GITHUB; return `https://raw.githubusercontent.com/${g.USER}/${g.REPO}/${g.REF}/${String(path).replace(/^\/+/,'')}`;
}
function toCdnFallback_(rawUrl){
  return rawUrl.replace(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i,
                        'https://cdn.jsdelivr.net/gh/$1/$2@$3/$4');
}
function urlOkOrCdn_(rawUrl){
  try{
    const r = UrlFetchApp.fetch(rawUrl, {muteHttpExceptions:true, followRedirects:true});
    if (r.getResponseCode()>=200 && r.getResponseCode()<400) return rawUrl;
  }catch(e){}
  const cdn = toCdnFallback_(rawUrl);
  try{
    const r2 = UrlFetchApp.fetch(cdn, {muteHttpExceptions:true, followRedirects:true});
    if (r2.getResponseCode()>=200 && r2.getResponseCode()<400) return cdn;
  }catch(e){}
  return "";
}

/* ---- 誤答抽出 ---- */
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

/* ---- 問題生成 ---- */
function generateQuestions_(){
  const pool = (CFG.STRICT.ALLOW_REQUIRED_ONLY ? readMasterRequiredOnly_() : readMasterStrict_());
  const cats = readCategories_();
  const lensIdx = buildLensIndex_();          // ★ 追加：実在ファイルの辞書
  const qs   = [];

  for (const r of pool.sort(()=>Math.random()-0.5)){
    if (qs.length >= 10) break;
    if (!_validRec(r)) continue;

    const ck   = _ck(r);
    const raw  = lensIdx[ck];                 // ★ GitHub上に実ファイルがあるか？
    if (!raw) continue;                       //    無ければスキップ

    const imgOk = urlOkOrCdn_(raw);           // raw → onerror で CDN へ
    if (!imgOk) continue;

    const ws = pickWrongAnswers_(r, pool, cats, 3);
    if (ws.length < 3) continue;

    const options = [
      {label:`${r.I} / ${r.J}`, isCorrect:true},
      ...ws.map(w=>({label:`${w.I} / ${w.J}`, isCorrect:false}))
    ].sort(()=>Math.random()-0.5);

    qs.push({
      qid:`CK:${ck}`, image: imgOk,
      specs:{DIA:r.P, G_DIA:r.Q, BC:r.R},
      correct:{E:r.E,I:r.I,J:r.J,K:r.K},
      options
    });
  }
  return qs;
}


/* ---- API ---- */
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
