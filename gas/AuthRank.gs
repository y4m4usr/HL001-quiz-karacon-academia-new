const RANK_SHEET_NAME = 'rank';
const RANK_TEST_SHEET_NAME = 'rank_test';

function ensureRankSheet_(isTest){
  const ss = SpreadsheetApp.openById(CFG.SHEET_IDS.MASTER);
  const name = isTest ? RANK_TEST_SHEET_NAME : RANK_SHEET_NAME;
  let sh = ss.getSheetByName(name);
  if (!sh){
    sh = ss.insertSheet(name);
    sh.appendRow(['ts','uid','session','qid','ck','correct','ms']);
  }
  return sh;
}

/* ===== サーバ直呼び（google.script.run 用） ===== */
function submit_(payload){
  const body = payload || {};
  const uid  = String(body.uid||'guest').slice(0,64);
  const ses  = String(body.session||('s'+Date.now()));
  const isTest = Boolean(body.test) || /^test\-/.test(uid) || /^test\-/.test(String(ses));
  const sh   = ensureRankSheet_(isTest);
  const now  = new Date();
  const rows = [];
  for (const r of (body.results||[])){
    const qid = String(r.qid||'');
    const ck  = qid.replace(/^CK:/,'');
    const ok  = r.correct ? 1 : 0;
    const ms  = Number(r.ms||0);
    rows.push([now, uid, ses, qid, ck, ok, ms]);
  }
  if (rows.length) sh.getRange(sh.getLastRow()+1,1,rows.length,rows[0].length).setValues(rows);
  return { ok:true, saved: rows.length, test:isTest };
}
function rankSrv_(isTest){
  const sh = ensureRankSheet_(Boolean(isTest));
  const v  = sh.getDataRange().getValues(); v.shift();
  const since = Date.now() - 7*24*3600*1000;
  const agg = new Map();
  for (const r of v){
    const ts = new Date(r[0]).getTime(); if (isNaN(ts) || ts < since) continue;
    const uid = String(r[1]||'guest');
    const ok  = Number(r[5]||0);
    const cur = agg.get(uid) || {score:0, correct:0, total:0};
    cur.total++; if (ok) { cur.correct++; cur.score += 10; }
    agg.set(uid, cur);
  }
  const rows = Array.from(agg.entries()).map(function(entry){
    return { uid: entry[0], score: entry[1].score, correct: entry[1].correct, total: entry[1].total };
  });
  rows.sort(function(a,b){ return (b.score - a.score) || (b.correct - a.correct); });
  return { ok:true, rank: rows.slice(0,20), test:Boolean(isTest) };
}
function mystatsSrv_(uid, isTest){
  const sh = ensureRankSheet_(Boolean(isTest));
  const v  = sh.getDataRange().getValues(); v.shift();
  let correct=0,total=0;
  for (const r of v){ if (String(r[1]||'') === uid){ total++; if (Number(r[5]||0)===1) correct++; } }
  return { ok:true, stats:{ uid, correct, total }, test:Boolean(isTest) };
}

/* ===== HTTP ルータ（外部API用。クライアントは server関数を使う） ===== */
function doGet(e){
  const p = e && e.parameter || {};
  if (!p.action) return index_();
  if (p.action==='items'){
    const n = Math.max(1, Math.min(10, Number(p.count||10)));
    const qs = generateQuestions_(n);
    return ContentService.createTextOutput(JSON.stringify({ok:true, items:qs}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (p.action==='health')  return health_();
  if (p.action==='rank')    return ContentService.createTextOutput(JSON.stringify(rankSrv_(String(p.test||'')==='1' || String(p.test||'').toLowerCase()==='true'))).setMimeType(ContentService.MimeType.JSON);
  if (p.action==='mystats') return ContentService.createTextOutput(JSON.stringify(mystatsSrv_(String(p.uid||'guest'), (String(p.test||'')==='1' || String(p.test||'').toLowerCase()==='true')))).setMimeType(ContentService.MimeType.JSON);
  return ContentService.createTextOutput(JSON.stringify({ok:false,error:'unknown action'})).setMimeType(ContentService.MimeType.JSON);
}
function doPost(e){
  const p = e && e.parameter || {};
  if (p.action==='submit'){
    const body = JSON.parse(e.postData.contents||'{}');
    return ContentService.createTextOutput(JSON.stringify(submit_(body))).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({ok:false,error:'unknown action'})).setMimeType(ContentService.MimeType.JSON);
}
