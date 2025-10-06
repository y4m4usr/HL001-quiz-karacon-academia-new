/** v1.2 最終：X列＝画像の正。必要時のみ命名フォールバック。10問必須。 */

const _isBlank = v => v === null || v === undefined || String(v).trim() === "";

/* ---------- helpers ---------- */
function _open_(id, sheetName){
  if (!id || /[【】<>]/.test(id)) throw new Error('Spreadsheet ID未設定: ' + sheetName);
  const ss = SpreadsheetApp.openById(id);
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('シートが見つかりません: ' + sheetName);
  return sh;
}
function _values_(sh, startRow, lastColIndex){
  const lr = sh.getLastRow(); if (lr < startRow) return [];
  const lc = Math.min(lastColIndex, sh.getLastColumn());
  return sh.getRange(startRow,1, lr-(startRow-1), lc).getValues();
}
function _ck(r){ const a=r?.E||"", b=r?.I||"", c=r?.J||"", d=r?.K||""; return [a,b,c,d].map(s=>String(s).trim()).join('|'); }
function _validRec(r){ return r && !['E','I','J','K','X'].some(k => _isBlank(r[k])); }

function buildImageUrlByNaming_(rec, kind/*lens|samune*/){
  const dir = (kind==='samune') ? CFG.GITHUB.PATHS.SAMUNE_DIR : CFG.GITHUB.PATHS.LENS_DIR;
  const fname = rec.E + '_' + rec.I + '_' + rec.J + '_' + rec.K + '_' + kind + '.jpg';
  const g = CFG.GITHUB;
  return 'https://raw.githubusercontent.com/' + g.USER + '/' + g.REPO + '/' + g.REF + '/' + dir + '/' + fname;
}
function toCdnFallback_(u){
  return String(u).replace(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i,
    'https://cdn.jsdelivr.net/gh/$1/$2@$3/$4');
}

// ---- image validation helpers (avoid HTML saved as .jpg) ----
function _headersContentType_(resp){
  try{
    var h = resp && typeof resp.getHeaders === 'function' ? resp.getHeaders() : {};
    if (!h) return '';
    for (var k in h){
      if (!Object.prototype.hasOwnProperty.call(h,k)) continue;
      if (String(k).toLowerCase() === 'content-type') return String(h[k]||'');
    }
  }catch(e){}
  return '';
}
function _looksLikeImageBytes_(bytes){
  try{
    if (!bytes || bytes.length < 4) return false;
    var b0=bytes[0]|0, b1=bytes[1]|0, b2=bytes[2]|0, b3=bytes[3]|0;
    // JPEG
    if (b0===0xFF && b1===0xD8 && b2===0xFF) return true;
    // PNG
    if (b0===0x89 && b1===0x50 && b2===0x4E && b3===0x47) return true;
    // GIF
    if (b0===0x47 && b1===0x49 && b2===0x46 && b3===0x38) return true;
    // WEBP: RIFF....WEBP
    if (bytes.length>=12 && b0===0x52 && b1===0x49 && b2===0x46 && b3===0x46 &&
        (bytes[8]|0)===0x57 && (bytes[9]|0)===0x45 && (bytes[10]|0)===0x42 && (bytes[11]|0)===0x50) return true;
  }catch(e){}
  return false;
}
function _fetchIsImage_(u){
  try{
    var res = UrlFetchApp.fetch(u, { muteHttpExceptions:true, followRedirects:true });
    var code = res.getResponseCode();
    if (code>=200 && code<400){
      var ct = _headersContentType_(res);
      if (/^image\//i.test(ct)) return true;
      var bytes = res.getContent();
      return _looksLikeImageBytes_(bytes);
    }
  }catch(e){}
  return false;
}
function toDriveDirect_(u){
  try{
    const s = String(u||"");
    let m = s.match(/https?:\/\/drive\.google\.com\/file\/d\/([^/]+)/i);
    if (m && m[1]) return 'https://drive.google.com/uc?export=view&id=' + m[1];
    m = s.match(/https?:\/\/drive\.google\.com\/open\?id=([^&]+)/i);
    if (m && m[1]) return 'https://drive.google.com/uc?export=view&id=' + m[1];
    return s;
  }catch(e){ return String(u||""); }
}
function urlOkOrCdn_(u){
  if (_isBlank(u)) return "";
  try{ if (_fetchIsImage_(u)) return u; }catch(e){}
  var cdn = toCdnFallback_(u);
  if (cdn && cdn!==u){
    try{ if (_fetchIsImage_(cdn)) return cdn; }catch(e){}
  }
  return "";
}

/* ---------- master ---------- */
function readMasterStrict_(){
  const sh = _open_(CFG.SHEET_IDS.MASTER, CFG.SHEETS.MASTER);
  const vs = _values_(sh, CFG.LAYOUT.MASTER.START_ROW, CFG.LAYOUT.MASTER.LAST_COL_INDEX);
  const C  = CFG.COLS, need = CFG.LAYOUT.MASTER.LAST_COL_INDEX;
  const out=[];
  for (let r of vs){
    if (!Array.isArray(r)) continue;
    if (r.length < need) r = r.concat(Array(need-r.length).fill(""));
    if (CFG.STRICT.ROW_MUST_BE_FULL && r.some(_isBlank)) continue;
    const rec = { E:r[C.E-1], I:r[C.I-1], J:r[C.J-1], K:r[C.K-1], P:r[C.P-1], Q:r[C.Q-1], R:r[C.R-1], W:r[C.W-1], X:r[C.X-1] };

    if (_isBlank(rec.X)) {
      if (CFG.MIGRATION.PERMIT_X_FALLBACK_GITHUB && !['E','I','J','K'].some(k=>_isBlank(rec[k]))){
        rec.X = buildImageUrlByNaming_(rec,'lens');
      } else {
        continue;
      }
    }
    if (!_validRec(rec)) continue;
    out.push(rec);
  }
  return out;
}

/* ---------- categories ---------- */
function readCategories_(){
  const sh = _open_(CFG.SHEET_IDS.CATEGORY, CFG.SHEETS.CATEGORY);
  const vs = _values_(sh, CFG.LAYOUT.CATEGORY.START_ROW, CFG.LAYOUT.CATEGORY.LAST_COL_INDEX);
  const B=CFG.COLS.CAT_B-1, C=CFG.COLS.CAT_C-1, F=CFG.COLS.CAT_F-1;
  const map=new Map();
  for (const r of vs){
    if (!Array.isArray(r)) continue;
    if (r.some(_isBlank)) continue;
    const brand = String(r[B]||"").trim();
    const color = String(r[C]||"").trim();
    const cats  = String(r[F]||"").split(/[\,\u3001\uFF0C\u30FB\/／|]+/).map(s=>s.trim()).filter(Boolean);
    if (!brand || !color || !cats.length) continue;
    map.set(brand + '|' + color, cats);
  }
  return map;
}

/* ---------- wrong answers (X必須) ---------- */
function pickWrongAnswers_(correct, pool, catMap, n){
  const corr = _ck(correct);
  const key = String(correct.I) + '|' + String(correct.J);
  const words = catMap.get(key)||[];
  const picked=[];
  const seen = new Set();

  function baseFilter(r){
    if (!r || _ck(r)===corr) return false;
    if (_isBlank(r.X)) return false;
    return true;
  }
  function pushUnique(list){
    for (const r of list){
      if (picked.length>=n) break;
      const ck = _ck(r);
      if (seen.has(ck)) continue;
      picked.push(r);
      seen.add(ck);
    }
  }

  const catMatch = pool.filter(r=>{
    if (!baseFilter(r)) return false;
    const c = catMap.get(String(r.I) + '|' + String(r.J))||[];
    return c.length && words.some(w=>c.includes(w));
  }).sort(()=>Math.random()-0.5);
  pushUnique(catMatch);

  if (picked.length<n){
    const colorMatch = pool.filter(r=>{
      if (!baseFilter(r)) return false;
      return (String(r.I) === String(correct.I)) || (String(r.J) === String(correct.J));
    }).sort(()=>Math.random()-0.5);
    pushUnique(colorMatch);
  }

  if (picked.length<n){
    const any = pool.filter(r=>baseFilter(r)).sort(()=>Math.random()-0.5);
    pushUnique(any);
  }

  return picked.slice(0,n);
}

/* ---------- image resolve (X→raw→CDN) ---------- */
function resolveImage_(rec){
  const u = !_isBlank(rec.X) ? String(rec.X).trim() : "";
  const tryGithub = function(){
    try{
      const lens = buildImageUrlByNaming_(rec, 'lens');
      let res = urlOkOrCdn_(lens);
      if (!res){
        const samune = buildImageUrlByNaming_(rec, 'samune');
        res = urlOkOrCdn_(samune);
      }
      return res || "";
    }catch(e){ return ""; }
  };

  // Prefer GitHub-hosted images when configured
  if (CFG?.MIGRATION?.PREFER_GITHUB){
    const g = tryGithub();
    if (g) return g;
  }

  let res = urlOkOrCdn_(toDriveDirect_(u));
  if (res) return res;

  // Fallback to GitHub naming if X was empty or unreachable
  res = tryGithub();
  return res || "";
}

/* ---------- generator (count件必須) ---------- */
function generateQuestions_(count){
  const pool = readMasterStrict_();
  const cats = readCategories_();
  const qs=[];
  for (const r of pool.sort(()=>Math.random()-0.5)){
    if (qs.length>=count) break;
    const img = resolveImage_(r);
    if (_isBlank(img)) continue;
    const ws = pickWrongAnswers_(r, pool, cats, 3);
    if (ws.length<3) continue;

    const options = [{label:String(r.I) + ' / ' + String(r.J), isCorrect:true}].concat(
                     ws.map(function(w){ return {label:String(w.I) + ' / ' + String(w.J), isCorrect:false}; })
                   ).sort(function(){ return Math.random()-0.5; });

    qs.push({ qid:'CK:' + _ck(r), image:img, specs:{DIA:r.P, G_DIA:r.Q, BC:r.R}, correct:{E:r.E,I:r.I,J:r.J,K:r.K}, options: options });
  }
  if (qs.length < count) throw new Error('クイズを作成するのに十分なデータがありません（最低' + count + '件必要）');
  return qs;
}

/* ---------- server-call functions (google.script.run 用) ---------- */
function itemsSrv_(count){ return { ok:true, items: generateQuestions_(Math.max(1,Math.min(10,Number(count)||10))) }; }
  
