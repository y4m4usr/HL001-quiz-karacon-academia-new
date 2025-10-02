/** =======================================================================
 *  AuthRank.gs  —  ランキング / マイ成績 / 提出(保存)
 *  SPEC-LOCK（変更不可の原則）:
 *   - 集計キーは CK = E|I|J|K 完全一致
 *   - 保存先は Sheets の "RESULTS" シート（Drive ファイル生成はしない）
 *   - WebApp のルーターは DataAccess.gs 側で集約（本ファイルは関数のみ提供）
 *  使い方（ルーター結線例は末尾の「Router Snippet」を参照）
 * ======================================================================= */

/* ─────────────────────
   共通ユーティリティ
   ───────────────────── */
function _rank_isBlank(v){ return v === null || v === undefined || String(v).trim() === ""; }
function _rank_now(){ return new Date(); }
function _rank_ck_from_rec(rec){
  if (!rec || ["E","I","J","K"].some(k => _rank_isBlank(rec[k]))) throw new Error("ck(): invalid record");
  return [rec.E, rec.I, rec.J, rec.K].join("|");
}
function _rank_ck(E,I,J,K){
  if ([_rank_isBlank(E),_rank_isBlank(I),_rank_isBlank(J),_rank_isBlank(K)].some(Boolean)) throw new Error("ck(E,I,J,K): invalid");
  return [E,I,J,K].join("|");
}
function _rank_bool(x){
  if (x === true) return true;
  var s = String(x).toLowerCase();
  return (s === "true" || s === "1" || s === "yes");
}
function _rank_json(o){
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ─────────────────────
   RESULTS シート生成/取得
   ───────────────────── */
function _rank_ensureResultsSheet_(){
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName("RESULTS");
  if (!sh) {
    sh = ss.insertSheet("RESULTS");
    sh.appendRow([
      "answered_at",  // 1
      "uid",          // 2
      "session_id",   // 3
      "E",            // 4
      "I",            // 5
      "J",            // 6
      "K",            // 7
      "ck",           // 8  E|I|J|K
      "qid",          // 9  "CK:E|I|J|K"
      "correct",      // 10 TRUE/FALSE
      "time_ms",      // 11 数値
      "score",        // 12 数値
      "app_ver",      // 13 任意
      "ua"            // 14 任意
    ]);
  }
  return sh;
}

/* ─────────────────────
   提出（保存）API 本体
   呼び出し: submit_(payload)
   payload=
    {
      uid, session_id,
      E, I, J, K,
      qid,
      correct,    // boolean or "true"/"false"
      time_ms,    // number (ms)
      score,      // number
      app_ver, ua // optional
    }
   返り値: { ok: true }
   ───────────────────── */
function submit_(p){
  var need = ["uid","session_id","E","I","J","K","qid","correct","time_ms"];
  for (var i=0;i<need.length;i++){
    if (_rank_isBlank(p[need[i]])) return _rank_json({ ok:false, error:"missing "+need[i] });
  }
  var sh = _rank_ensureResultsSheet_();
  var ck = _rank_ck(p.E, p.I, p.J, p.K);
  var row = [
    _rank_now(),              // answered_at
    String(p.uid),            // uid
    String(p.session_id),     // session_id
    String(p.E),              // E
    String(p.I),              // I
    String(p.J),              // J
    String(p.K),              // K
    ck,                       // ck
    String(p.qid),            // qid
    _rank_bool(p.correct),    // correct
    Number(p.time_ms||0),     // time_ms
    Number(p.score||0),       // score
    String(p.app_ver||""),    // app_ver
    String(p.ua||"")          // ua
  ];
  sh.appendRow(row);
  return _rank_json({ ok:true });
}

/* ─────────────────────
   ランキング API 本体
   呼び出し: rankings_(params)
   params = { ck, period?: "daily"|"weekly"|"all" }
   掲載条件: attempts >= 3
   ソート: 正答数 desc → 平均time asc → 試行数 desc → 最終回答 desc
   ───────────────────── */
function rankings_(p){
  var ck = String(p.ck||"");
  if (!ck) return _rank_json({ ok:false, error:"ck required" });

  var period = String(p.period||"weekly"); // 既定 weekly
  var now=new Date(), from=new Date(0);
  if (period==="daily"){
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // 当日0:00
  } else if (period==="weekly"){
    var d=(now.getDay()+6)%7; // 月曜起点
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate()-d);
  }

  var sh = _rank_ensureResultsSheet_();
  var v  = sh.getDataRange().getValues();
  var COL = { answered_at:1, uid:2, ck:8, correct:10, time_ms:11, score:12 };

  var rows=[];
  for (var i=2;i<=v.length;i++){
    var r=v[i-1];
    if (String(r[COL.ck-1]) !== ck) continue;
    var dt = new Date(r[COL.answered_at-1]);
    if (period!=="all" && dt<from) continue;
    rows.push({
      uid: String(r[COL.uid-1]),
      correct: (r[COL.correct-1]===true || String(r[COL.correct-1])==="TRUE"),
      time_ms: Number(r[COL.time_ms-1]||0),
      score:   Number(r[COL.score-1]||0),
      answered_at: dt
    });
  }

  var byUid = {};
  rows.forEach(function(x){
    var o = byUid[x.uid]||(byUid[x.uid]={ uid:x.uid, attempts:0, correct_count:0, sum_time:0, total_score:0, last:x.answered_at });
    o.attempts++;
    if (x.correct) o.correct_count++;
    o.sum_time += x.time_ms;
    o.total_score += x.score;
    if (x.answered_at > o.last) o.last = x.answered_at;
  });

  var items = Object.values(byUid).map(function(o){
    return {
      uid: o.uid,
      attempts: o.attempts,
      correct_count: o.correct_count,
      avg_time_ms: o.sum_time/Math.max(1,o.attempts),
      total_score: o.total_score,
      last_answered_at: o.last
    };
  }).filter(function(x){ return x.attempts >= 3; })
    .sort(function(a,b){
      return (b.correct_count - a.correct_count) ||
             (a.avg_time_ms   - b.avg_time_ms)   ||
             (b.attempts      - a.attempts)      ||
             (b.last_answered_at - a.last_answered_at);
    });

  return _rank_json({ ok:true, items: items.slice(0,100) });
}

/* ─────────────────────
   マイ成績 API 本体
   呼び出し: mystats_(params)
   params = { uid }
   返却: CKごとの集計一覧
   ───────────────────── */
function mystats_(p){
  var uid = String(p.uid||"");
  if (!uid) return _rank_json({ ok:false, error:"uid required" });

  var sh = _rank_ensureResultsSheet_();
  var v  = sh.getDataRange().getValues();
  var COL = { answered_at:1, uid:2, ck:8, correct:10, time_ms:11, score:12 };

  var rows=[];
  for (var i=2;i<=v.length;i++){
    var r=v[i-1];
    if (String(r[COL.uid-1]) !== uid) continue;
    rows.push({
      ck: String(r[COL.ck-1]),
      correct: (r[COL.correct-1]===true || String(r[COL.correct-1])==="TRUE"),
      time_ms: Number(r[COL.time_ms-1]||0),
      score:   Number(r[COL.score-1]||0),
      answered_at: new Date(r[COL.answered_at-1])
    });
  }

  var byCk = {};
  rows.forEach(function(x){
    var o = byCk[x.ck]||(byCk[x.ck]={ ck:x.ck, attempts:0, correct_count:0, sum_time:0, total_score:0, last:x.answered_at });
    o.attempts++; if (x.correct) o.correct_count++;
    o.sum_time += x.time_ms; o.total_score += x.score;
    if (x.answered_at > o.last) o.last = x.answered_at;
  });

  var items = Object.values(byCk).map(function(o){
    return {
      ck: o.ck,
      attempts: o.attempts,
      correct_count: o.correct_count,
      avg_time_ms: o.sum_time/Math.max(1,o.attempts),
      total_score: o.total_score,
      last_answered_at: o.last
    };
  }).sort(function(a,b){
    return (b.correct_count - a.correct_count) ||
           (a.avg_time_ms   - b.avg_time_ms);
  });

  return _rank_json({ ok:true, items });
}

/* ─────────────────────
   参考: ルーターに接続するパラメータ仕様
   ─────────────────────
   GET  action=rankings&ck=E|I|J|K[&period=daily|weekly|all]
   GET  action=mystats&uid=<uid>
   POST action=submit  body: 上記 submit_ の payload
   ───────────────────── */
