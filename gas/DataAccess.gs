/** v2.0: GitHub命名画像優先、E|I|J重複除外、AJカテゴリで誤答抽出、ヒント対応。 */

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
function _eij(r){ const a=r?.E||"", b=r?.I||"", c=r?.J||""; return [a,b,c].map(s=>String(s).trim()).join('|'); }
function _isDash(v){ return String(v||"").trim()==='-'; }
function _validRec(r){
  if (!r) return false;
  // 必須: E/I/J, かつ AJ(カテゴリ) が '-' でない
  if ([r.E, r.I, r.J].some(x => _isBlank(x) || _isDash(x))) return false;
  if (_isBlank(r.AJ) || _isDash(r.AJ)) return false;
  return true;
}

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
    const rec = {
      E:r[C.E-1], I:r[C.I-1], J:r[C.J-1], K:r[C.K-1],
      P:r[C.P-1], Q:r[C.Q-1], R:r[C.R-1],
      W:r[C.W-1], X:r[C.X-1], AJ:r[C.AJ-1], AK:r[C.AK-1]
    };
    if (!_validRec(rec)) continue; // v2.0: E/I/J/AJ が必須、'-'除外
    out.push(rec);
  }
  return out;
}

/* ---------- categories ---------- */
// v2.0: カテゴリは master の AJ 列を用いる

/* ---------- wrong answers (X必須) ---------- */
function pickWrongAnswers_(correct, pool, n){
  const corr = _ck(correct);
  const correctCats = String(correct.AJ||"")
    .split(/[\,\u3001\uFF0C\u30FB\/／|]+/)
    .map(function(s){return s.trim();})
    .filter(Boolean);
  const picked=[];
  const seenEIJ = new Set();

  function baseFilter(r){
    if (!r) return false;
    if (_eij(r) === _eij(correct)) return false; // v2.1.1: E|I|J が同じは不可
    return true;
  }
  function pushUnique(list){
    for (const r of list){
      if (picked.length>=n) break;
      const eij = _eij(r);
      if (seenEIJ.has(eij)) continue;
      picked.push(r);
      seenEIJ.add(eij);
    }
  }

  const catMatch = pool.filter(function(r){
    if (!baseFilter(r)) return false;
    const cats = String(r.AJ||"")
      .split(/[\,\u3001\uFF0C\u30FB\/／|]+/)
      .map(function(s){return s.trim();})
      .filter(Boolean);
    return cats.length && correctCats.some(function(w){return cats.indexOf(w)>=0;});
  }).sort(function(){return Math.random()-0.5;});
  pushUnique(catMatch);

  if (picked.length<n){
    const colorMatch = pool.filter(function(r){
      if (!baseFilter(r)) return false;
      return (String(r.I) === String(correct.I)) || (String(r.J) === String(correct.J));
    }).sort(function(){return Math.random()-0.5;});
    pushUnique(colorMatch);
  }

  if (picked.length<n){
    const any = pool.filter(function(r){return baseFilter(r);}).sort(function(){return Math.random()-0.5;});
    pushUnique(any);
  }

  return picked.slice(0,n);
}

/* ---------- image resolve (X→raw→CDN) ---------- */
function resolveImages_(rec){
  // v2.0: GitHub命名優先。lens と samune の両方を解決し返す。
  var lens = urlOkOrCdn_(buildImageUrlByNaming_(rec,'lens'));
  var sam  = urlOkOrCdn_(buildImageUrlByNaming_(rec,'samune'));
  // 旧X列があれば最終フォールバックとして使用
  if (!lens && !_isBlank(rec.X)) lens = urlOkOrCdn_(toDriveDirect_(String(rec.X)));
  if (!sam) sam = lens; // サムネ未取得時はレンズで代替
  return { lens: lens||"", samune: sam||"" };
}

/* ---------- generator (count件必須) ---------- */
function generateQuestions_(count){
  const pool = readMasterStrict_();
  if (!pool.length) throw new Error('データがありません（有効行なし）');
  const qs=[];
  const seenEIJ = new Set();
  const shuffled = pool.slice().sort(function(){ return Math.random()-0.5; });
  for (var i=0; i<shuffled.length; i++){
    if (qs.length>=count) break;
    var r = shuffled[i];
    var eij = _eij(r);
    if (seenEIJ.has(eij)) continue; // v2.0: E|I|J 重複除外
    var imgs = resolveImages_(r);
    if (_isBlank(imgs.lens)) continue; // 表示画像がなければスキップ
    var ws = pickWrongAnswers_(r, pool, 3);
    if (ws.length<3) continue;

    var options = [{label:String(r.I) + ' / ' + String(r.J), isCorrect:true}].concat(
                   ws.map(function(w){ return {label:String(w.I) + ' / ' + String(w.J), isCorrect:false}; })
                 ).sort(function(){ return Math.random()-0.5; });

    qs.push({
      qid:'CK:' + _ck(r),
      image: imgs.lens,
      thumb: imgs.samune,
      specs:{DIA:r.P, G_DIA:r.Q, BC:r.R},
      comment: String(r.AK||""),
      correct:{E:r.E,I:r.I,J:r.J,K:r.K},
      options: options
    });
    seenEIJ.add(eij);
  }
  if (qs.length < count) throw new Error('クイズを作成するのに十分なデータがありません（最低' + count + '件必要）');
  return qs;
}

/* ---------- server-call functions (google.script.run 用) ---------- */
function itemsSrv_(count){ return { ok:true, items: generateQuestions_(Math.max(1,Math.min(10,Number(count)||10))) }; }
  
