  /** SPEC-LOCK: 本ファイルは「最終構造化仕様（出題ロジック簡素化版）」に準拠し、以下を厳守する。
 *  - 2行目=項目／3行目〜=データ、行内に空白セルが1つでもあれば不採用（評価範囲は CFG.LAYOUT の LAST_COL_INDEX まで）
 *  - 必須列 E/I/J/K/X がすべて非空。クイズ表示は X=レンズのみ。W=サムネは正解時フィードバック用。
 *  - ランタイムで Drive は触らない（CSV出力や DriveApp を使用しない）。manual_fix_queue はシートへ追記。
 *  - CK=E|I|J|K でランキング/マイ成績を集計。
 * 改変が必要な場合は Config のみ変更し、関数の契約は変えないこと。
 */
/** SPEC-LOCK: Ranking & MyStats (CK=E|I|J|K 完全一致, Drive非依存)
 * シート RESULTS に回答履歴を追記し、ランキング/マイ成績を返します。
 * 既存の doGet/doPost が別ファイル(DataAccess.gs)にある想定のため、
 * 本ファイルは関数だけを提供します（ルーターは既存に統合してください）。
 */

// === 共通ユーティリティ ===
function _now_(){ return new Date(); }
function _isBlank(v){ return v === null || v === undefined || String(v).trim() === ""; }
function _ck_rec_(rec){ return [rec.E, rec.I, rec.J, rec.K].join("|"); }
function _ck_vals_(E,I,J,K){ return [E,I,J,K].join("|"); }

// === RESULTS シートの用意 ===
function _ensureResultsSheet_(){
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName("RESULTS");
  if (!sh) {
    sh = ss.insertSheet("RESULTS");
    sh.appendRow([
      "answered_at","uid","session_id",
      "E","I","J","K","ck","qid",
      "correct","time_ms","score",
      "app_ver","ua"
    ]);
  }
  return sh;
}

// === 送信（submit）: p={ uid, session_id, E,I,J,K, qid, correct, time_ms, score, app_ver } ===
// 既存ルーター側で: doPost(e){ return submit_(JSON.parse(e.postData.contents)); } 等で呼び出してください。
function submit_(p){
  var required = ["uid","session_id","E","I","J","K","qid","correct","time_ms"];
  for (var i=0; i<required.length; i++){
    if (_isBlank(p[required[i]])) return _json_({ok:false, error:"missing "+required[i]});
  }
  var sh = _ensureResultsSheet_();
  var ck = _ck_vals_(p.E, p.I, p.J, p.K);
  var row = [
    _now_(),                         // answered_at
    String(p.uid),                   // uid
    String(p.session_id),            // session_id
    String(p.E), String(p.I), String(p.J), String(p.K),
    ck,                              // ck
    String(p.qid),                   // qid
    (p.correct===true || String(p.correct)=="true" || String(p.correct)=="TRUE"),
    Number(p.time_ms||0),
    Number(p.score||0),
    String(p.app_ver||""),
    String(p.ua||"")
  ];
  sh.appendRow(row);
  return _json_({ok:true});
}

// === ランキング: p={ ck, period: "daily"|"weekly"|"all" } ===
// 掲載条件: attempts >= 3。ソート: 正答数 desc → 平均time asc → 試行数 desc → 最終回答 desc
function rankings_(p){
  var ck = String(p.ck||"");
  if (!ck) return _json_({ok:false, error:"ck required"});

  var period = String(p.period||"weekly"); // 既定は weekly
  var now=new Date(), from=new Date(0);
  if (period==="daily"){
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period==="weekly"){
    var d = (now.getDay()+6)%7; // 月曜起点
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate()-d);
  }

  var sh = _ensureResultsSheet_();
  var v  = sh.getDataRange().getValues();
  var COL = { answered_at:1, uid:2, ck:8, correct:10, time_ms:11, score:12 }; // 1-based

  var rows=[];
  for (var i=2; i<=v.length; i++){
    var r=v[i-1];
    if (String(r[COL.ck-1])!==ck) continue;
    var dt=new Date(r[COL.answered_at-1]);
    if (period!=="all" && dt<from) continue;
    rows.push({
      uid: String(r[COL.uid-1]),
      correct: (r[COL.correct-1]===true || String(r[COL.correct-1])==="TRUE"),
      time_ms: Number(r[COL.time_ms-1]||0),
      score:   Number(r[COL.score-1]||0),
      answered_at: dt
    });
  }
  var byUid={};
  rows.forEach(function(x){
    var o = byUid[x.uid]||(byUid[x.uid]={uid:x.uid, attempts:0, correct_count:0, sum_time:0, total_score:0, last:x.answered_at});
    o.attempts++;
    if (x.correct) o.correct_count++;
    o.sum_time += x.time_ms;
    o.total_score += x.score;
    if (x.answered_at>o.last) o.last=x.answered_at;
  });
  var items = Object.values(byUid).map(function(o){
    return {
      uid:o.uid,
      attempts:o.attempts,
      correct_count:o.correct_count,
      avg_time_ms: o.sum_time/Math.max(1,o.attempts),
      total_score:o.total_score,
      last_answered_at:o.last
    };
  }).filter(function(x){ return x.attempts>=3; })
    .sort(function(a,b){
      return (b.correct_count-a.correct_count) ||
             (a.avg_time_ms-b.avg_time_ms)     ||
             (b.attempts-a.attempts)           ||
             (b.last_answered_at-a.last_answered_at);
    });

  return _json_({ok:true, items: items.slice(0,100)});
}

// === マイ成績: p={ uid, period? }（必要に応じて任意拡張） ===
function mystats_(p){
  var uid = String(p.uid||"");
  if (!uid) return _json_({ok:false, error:"uid required"});

  var sh = _ensureResultsSheet_();
  var v  = sh.getDataRange().getValues();
  var COL = { answered_at:1, uid:2, ck:8, correct:10, time_ms:11, score:12 };

  var rows=[];
  for (var i=2;i<=v.length;i++){
    var r=v[i-1];
    if (String(r[COL.uid-1])!==uid) continue;
    rows.push({
      ck: String(r[COL.ck-1]),
      correct: (r[COL.correct-1]===true || String(r[COL.correct-1])==="TRUE"),
      time_ms: Number(r[COL.time_ms-1]||0),
      score:   Number(r[COL.score-1]||0),
      answered_at: new Date(r[COL.answered_at-1])
    });
  }
  // CK 別に集計
  var byCk = {};
  rows.forEach(function(x){
    var o = byCk[x.ck]||(byCk[x.ck]={ck:x.ck, attempts:0, correct_count:0, sum_time:0, total_score:0, last:x.answered_at});
    o.attempts++; if (x.correct) o.correct_count++;
    o.sum_time += x.time_ms; o.total_score += x.score;
    if (x.answered_at>o.last) o.last=x.answered_at;
  });
  var items = Object.values(byCk).map(function(o){
    return {
      ck:o.ck,
      attempts:o.attempts,
      correct_count:o.correct_count,
      avg_time_ms:o.sum_time/Math.max(1,o.attempts),
      total_score:o.total_score,
      last_answered_at:o.last
    };
  }).sort(function(a,b){ return (b.correct_count-a.correct_count)||(a.avg_time_ms-b.avg_time_ms); });

  return _json_({ok:true, items});
}

// === JSON 出力 ===
function _json_(o){
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
