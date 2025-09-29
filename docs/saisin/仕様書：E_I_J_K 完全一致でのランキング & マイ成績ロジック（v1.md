

---

# **仕様書：E/I/J/K 完全一致でのランキング & マイ成績ロジック（v1.0）**

以下は、「**ランキング**」と「**マイ成績（My 成績）**」の**収集ロジック**を *G列（品番）→E/I/J/K（元品番/ブランド(カナ)/カラー(カナ)/装用期間）完全一致* へ切替えるための\*\*実装仕様書（MD）\*\*です。  
 UIは既存ワイヤーフレームのトーン&マナーを踏襲し、**E/I/J/K コンポジットキー**での厳密集計を徹底します。フロントは *docs/* 配下に静的ページ（ranking.html / my-stats.html）を追加し、バックはGAS（Apps Script Web App）で結果蓄積＆ランキング集計を提供する前提でまとめています。リポジトリは *y4m4usr/HL001-quiz-karacon-academia-new* を基準に記述しています。([GitHub](https://github.com/y4m4usr/HL001-quiz-karacon-academia-new))  
 （ページ構成・スタイルは共有ワイヤーフレームの意匠を継承してください。）

## **TL;DR（変更点の要約）**

* **キー切替**：集計キーを **G（品番）→ E/I/J/K（元品番/ブランド/カラー/装用期間）** の**完全一致**へ移行。  
   → 画像ファイル名を `_` でパースし **`E|I|J|K`** の複合キー（以下 **CK**）を生成。CKに一致するデータ**のみ**集計対象。

* **ランキング**：CKごとに **正答数 → 平均解答時間 → 試行数 → 最終解答時刻** の優先順でソート（週次/日次/通期）。

* **マイ成績**：端末匿名UIDごとに、**CK単位の累積（正答数/平均時間/連続正解）と日別推移**を表示。

* **収集**：フロントで解答イベントを**ローカル保存 \+ バッファ送信**、GASが **RESULTS シート**へ追記。**CK不正**は **manual\_fix\_queue** へ。

* **表示**：`docs/ranking.html` / `docs/my-stats.html` を新規追加。グラフ・表の既定フォントは**Noto Sans JP**。

* **互換**：旧G列ベースの記録は**ランキングから除外**（必要なら後日マイグレーションでCK付与）。

開発は「AI主導・一貫した開発手順」を踏襲（ローカルで編集→GitHub管理→自動化）します。

---

## **用語・前提**

* **E/I/J/K**：元品番（E）、ブランド(カナ)（I）、カラー(カナ)（J）、装用期間（K）。

* **CK（Composite Key）**：`E|I|J|K`（例：`HL001|ｱｲｸﾛｰｾﾞｯﾄ|ちびこっぺぱん|1day`）。

* **画像ファイル名規約**：`E_I_J_K_{種別}.jpg`（例：`HL001_ｱｲｸﾛｰｾﾞｯﾄ_ちびこっぺぱん_1day_lens.jpg`）。

  * 正規表現例：`^(?<E>[^_]+)_(?<I>[^_]+)_(?<J>[^_]+)_(?<K>[^_]+)_[^_]+\.jpe?g$`

* **完全一致のみ**採用。パース不能・マスター不一致は**manual\_fix\_queue**へ回送。

* **匿名UID**：端末ごとにランダム生成しLocalStorageへ保持（PIIなし）。

---

## **図解（Mermaid）**

### **1\) イベント収集〜ランキング反映：全体フロー**

flowchart LR  
  A\[Quiz UI\<br/\>（問題・画像表示）\] \--\> B\[ファイル名から E/I/J/K パース\<br/\>CK \= E|I|J|K 生成\]  
  B \--\>|OK| C\[採点・スコア算出\<br/\>correct/time\_ms/score\]  
  B \--\>|NG| M\[manual\_fix\_queue へ保留\]  
  C \--\> D\[Local Buffer\<br/\>(localStorage.queue)\]  
  D \--\> E{オンライン?}  
  E \-- Yes \--\> F\[送信 /api (GAS Web App)\]  
  E \-- No \--\> D  
  F \--\> G\[Google Sheets: RESULTS 追記\]  
  G \--\> H\[集計ビュー: RANKINGS\]  
  H \--\> I\[ranking.html 取得・表示\]  
  G \--\> J\[マイ成績API（UID単位集計）\]  
  J \--\> K\[my-stats.html 取得・表示\]

### **2\) データモデル（ER）**

erDiagram  
  RESULTS {  
    string uid  
    string session\_id  
    string E  
    string I  
    string J  
    string K  
    string ck  "E|I|J|K"  
    string qid "任意：問題ID/ページID"  
    boolean correct  
    number time\_ms  
    number score  
    datetime answered\_at  
    string app\_ver  
    string ua  
  }

  RANKINGS {  
    string ck  
    string period "daily/weekly/all"  
    string uid  
    number correct\_count  
    number avg\_time\_ms  
    number attempts  
    number total\_score  
    datetime last\_answered\_at  
  }

  USERS {  
    string uid  
    datetime first\_seen  
    datetime last\_seen  
    string device\_fingerprint  
  }

  RESULTS ||--o{ RANKINGS : aggregates  
  USERS ||--o{ RESULTS : logs

### **3\) シーケンス（回答〜反映）**

sequenceDiagram  
  participant U as User  
  participant FE as Frontend  
  participant GAS as Apps Script  
  participant GS as Google Sheets

  U-\>\>FE: 回答を選択  
  FE-\>\>FE: 画像名→E/I/J/K→ck生成・採点  
  FE-\>\>FE: localStorage.queue へpush  
  alt オンライン  
    FE-\>\>GAS: POST /exec {events...}  
    GAS-\>\>GS: RESULTS へ appendRows  
    GAS-\>\>FE: 200 OK  
    FE-\>\>U: 最新ランキング/成績を再読込  
  else オフライン  
    FE-\>\>U: ローカルに一時保存（バッファ）  
  end

---

## **仕様詳細**

### **1\. 集計キーとバリデーション**

* **CK生成**：ファイル名（または問題メタ）から先頭4トークンを抽出 → `E|I|J|K` を連結。

* **対象判定**：

  * CK が **空/パース不能** → **manual\_fix\_queue** へ入れてランキング集計**除外**。

  * 必要に応じて **マスター（E/I/J/K列のみのCSV/Sheet）** にも突合し完全一致のみ採用（推奨）。

* **互換**：旧データ（G列のみ）はランキング**非対象**。後日バックフィルする場合は、マスター結合でCKを付与してから適用。

### **2\. 採点ロジック（シンプル・可調整）**

* **score** \= `correct ? 100 : 0` \+ `time_bonus`

* **time\_bonus** \= `correct の場合のみ max(0, 60000 - time_ms) / 6000`（0〜10点）

  * 1分以内で最大＋10点、以降は0。

* 保存する主な指標：`correct (bool)`, `time_ms`, `score`, `answered_at(ISO)`

### **3\. ランキングのソート・期間**

* **単位**：**CK別**に集計（同一レンズ/ブランド/カラー/装用期間の勝負）

* **期間**：`daily`（当日0:00〜）、`weekly`（ISO週）、year（年間）、 `all`（全期間）

* **ソート優先**：  
   75 43

  1. `avg_time_ms`（短い順）

  2. `attempts`（多い順）

  3. `last_answered_at`（新しい順）

* **閾値**：デフォルトで `attempts >= 3` をランキング掲載条件（スパム/偶然値の抑制）

### **4\. マイ成績（My 成績）**

* **集計軸**：UIDごとに

  * CK別サマリ：`correct_count / attempts / avg_time_ms / best_streak`

  * 日別推移：`daily_correct / daily_attempts / daily_accuracy(%)`

* **表示**：

  * CK別カード（アイキャッチに該当レンズ画像を表示）

  * 直近7/30日ラインチャート（正答率・試行数）

* **オフライン**：ローカル保存のみで当面可。オンライン時にリモート集計結果とマージ表示。

画面構成・カードUIのトーンは既存ワイヤーフレームに合わせます。

---

## **実装（コピペ可）**

### **フロント（共通：Noto Sans JP を既定フォント）**

リポジトリの *docs/* に以下を追加（GitHub Pages公開に適合）。([GitHub](https://github.com/y4m4usr/HL001-quiz-karacon-academia-new))

docs/  
  assets/fonts/NotoSansJP-Regular.woff2   \# 既存フォントZIPから配置  
  css/base.css  
  js/common.js  
  ranking.html  
  js/ranking.js  
  my-stats.html  
  js/my-stats.js

**`docs/css/base.css`**（フォント必須・日本語化対策）

@font-face {  
  font-family: "Noto Sans JP";  
  src: url("./../assets/fonts/NotoSansJP-Regular.woff2") format("woff2");  
  font-weight: 400;  
  font-style: normal;  
  font-display: swap;  
}  
:root {  
  \--font-sans: "Noto Sans JP", system-ui, \-apple-system, "Segoe UI",  
               "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;  
}  
html,body { font-family: var(--font-sans); }

**`docs/js/common.js`**（CKパース・UID・採点・送信）

// 匿名UID（端末ローカル）を確保  
export function getUID() {  
  const k \= "karacon\_uid";  
  let uid \= localStorage.getItem(k);  
  if (\!uid) {  
    uid \= crypto.randomUUID ? crypto.randomUUID()  
                            : String(Date.now()) \+ Math.random().toString(16).slice(2);  
    localStorage.setItem(k, uid);  
  }  
  return uid;  
}

// 画像ファイル名 or パスから CK を生成（先頭4トークン）  
export function parseFilenameEijk(fileOrPath) {  
  const base \= fileOrPath.split("/").pop().replace(/\\.\[^.\]+$/, "");  
  const parts \= base.split("\_").map(s \=\> s.trim());  
  if (parts.length \< 4\) return null;  
  const \[E,I,J,K\] \= parts;  
  return { E,I,J,K, ck: \`${E}|${I}|${J}|${K}\` };  
}

// 採点（時間ボーナス：最大+10）  
export function computeScore({ correct, timeMs }) {  
  const base \= correct ? 100 : 0;  
  const bonus \= correct ? Math.max(0, 60000 \- (timeMs || 0)) / 6000 : 0;  
  return Math.round(base \+ bonus);  
}

// 解答イベントをローカルバッファし、可能なら即時送信  
export async function enqueueAndFlush(event, endpoint) {  
  const key \= "karacon\_queue";  
  const q \= JSON.parse(localStorage.getItem(key) || "\[\]");  
  q.push(event);  
  localStorage.setItem(key, JSON.stringify(q));  
  try {  
    if (navigator.onLine && endpoint) {  
      const res \= await fetch(endpoint, {  
        method: "POST",  
        headers: { "Content-Type": "application/json" },  
        body: JSON.stringify({ events: q })  
      });  
      if (res.ok) localStorage.setItem(key, "\[\]"); // 送信成功でクリア  
    }  
  } catch (\_) { /\* オフラインはそのまま \*/ }  
}

解答処理側では、画像名（例：`HL001_..._lens.jpg`）から `parseFilenameEijk()` を呼び、`computeScore()` とともに `enqueueAndFlush()` へ渡します。

**送信イベント例**

import { getUID, parseFilenameEijk, computeScore, enqueueAndFlush } from "./common.js";

function onAnswer({ imageFilename, correct, timeMs, qid }) {  
  const p \= parseFilenameEijk(imageFilename);  
  const now \= new Date().toISOString();  
  const uid \= getUID();  
  const session \= sessionStorage.getItem("karacon\_sid") || (() \=\> {  
    const s \= (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());  
    sessionStorage.setItem("karacon\_sid", s);  
    return s;  
  })();

  const ev \= p ? {  
    uid, session\_id: session,  
    E: p.E, I: p.I, J: p.J, K: p.K, ck: p.ck,  
    qid: qid || null,  
    correct: \!\!correct,  
    time\_ms: timeMs|0,  
    score: computeScore({ correct, timeMs }),  
    answered\_at: now,  
    app\_ver: "quiz-v1",  
    ua: navigator.userAgent  
  } : {  
    uid, session\_id: session,  
    E: "", I: "", J: "", K: "", ck: "",  
    qid: qid || null,  
    correct: \!\!correct, time\_ms: timeMs|0, score: 0,  
    answered\_at: now, app\_ver: "quiz-v1", ua: navigator.userAgent,  
    \_\_manual\_fix\_\_: imageFilename  
  };

  // GASの公開URLに差し替え  
  enqueueAndFlush(ev, "https://script.google.com/macros/s/【GAS\_DEPLOY\_ID】/exec");  
}

---

### **ランキング画面**

**`docs/ranking.html`**

\<\!doctype html\>  
\<html lang="ja"\>  
\<head\>  
\<meta charset="utf-8"\>  
\<meta name="viewport" content="width=device-width,initial-scale=1"\>  
\<link rel="stylesheet" href="./css/base.css"\>  
\<title\>ランキング｜Karacon Academia\</title\>  
\</head\>  
\<body\>  
  \<main\>  
    \<h1\>ランキング\</h1\>  
    \<section\>  
      \<label\>CK（E|I|J|K）\</label\>  
      \<input id="ck" placeholder="HL001|ｱｲｸﾛｰｾﾞｯﾄ|ちびこっぺぱん|1day" style="width:100%"\>  
      \<div\>  
        \<button data-period="daily"\>日次\</button\>  
        \<button data-period="weekly"\>週次\</button\>  
        \<button data-period="all"\>通期\</button\>  
      \</div\>  
      \<ol id="list"\>\</ol\>  
    \</section\>  
  \</main\>  
  \<script type="module" src="./js/ranking.js"\>\</script\>  
\</body\>  
\</html\>

**`docs/js/ranking.js`**

const ENDPOINT \= "https://script.google.com/macros/s/【GAS\_DEPLOY\_ID】/exec";

const list \= document.getElementById("list");  
const ckInput \= document.getElementById("ck");  
document.querySelectorAll("button\[data-period\]").forEach(btn \=\> {  
  btn.addEventListener("click", () \=\> load(btn.dataset.period));  
});

async function load(period \= "weekly") {  
  const ck \= ckInput.value.trim();  
  if (\!ck) { list.innerHTML \= "\<li\>CK を入力してください\</li\>"; return; }  
  const url \= new URL(ENDPOINT);  
  url.searchParams.set("path", "rankings");  
  url.searchParams.set("ck", ck);  
  url.searchParams.set("period", period);  
  const res \= await fetch(url);  
  const data \= await res.json();

  list.innerHTML \= data.items.map((r, i) \=\>  
    \`\<li\>\#${i+1} UID:${r.uid.slice(0,8)}… / 正答:${r.correct\_count} / 平均${Math.round(r.avg\_time\_ms)}ms / 試行:${r.attempts} / スコア:${r.total\_score}\</li\>\`  
  ).join("") || "\<li\>該当なし\</li\>";  
}

---

### **マイ成績画面**

**`docs/my-stats.html`**

\<\!doctype html\>  
\<html lang="ja"\>  
\<head\>  
\<meta charset="utf-8"\>  
\<meta name="viewport" content="width=device-width,initial-scale=1"\>  
\<link rel="stylesheet" href="./css/base.css"\>  
\<title\>マイ成績｜Karacon Academia\</title\>  
\</head\>  
\<body\>  
  \<main\>  
    \<h1\>マイ成績\</h1\>  
    \<section\>  
      \<p id="uid"\>\</p\>  
      \<h2\>CK別サマリ\</h2\>  
      \<div id="cards"\>\</div\>  
      \<h2\>直近30日の推移\</h2\>  
      \<div id="trend"\>\</div\>  
    \</section\>  
  \</main\>  
  \<script type="module" src="./js/my-stats.js"\>\</script\>  
\</body\>  
\</html\>

**`docs/js/my-stats.js`**（ローカル履歴から簡易集計／リモートがあればマージ）

import { getUID } from "./common.js";  
const UID \= getUID();  
document.getElementById("uid").textContent \= \`あなたのUID: ${UID}\`;

function loadLocal() {  
  // 送信キューに残っているものも含め、ローカルからざっくり集計  
  const sent \= JSON.parse(localStorage.getItem("karacon\_sent") || "\[\]"); // 任意：送信済みを別保管している場合  
  const q \= JSON.parse(localStorage.getItem("karacon\_queue") || "\[\]");  
  const all \= \[...sent, ...q\].filter(r \=\> r && r.uid \=== UID && r.ck);  
  return all;  
}

function summarizeByCK(rows) {  
  const map \= new Map();  
  for (const r of rows) {  
    if (\!map.has(r.ck)) map.set(r.ck, \[\]);  
    map.get(r.ck).push(r);  
  }  
  return \[...map.entries()\].map((\[ck, rs\]) \=\> {  
    const attempts \= rs.length;  
    const correct \= rs.filter(x \=\> x.correct).length;  
    const avgTime \= rs.reduce((a,b)=\>a+(b.time\_ms||0),0)/Math.max(1,attempts);  
    const bestStreak \= (() \=\> {  
      let max=0, cur=0;  
      rs.sort((a,b)=\>a.answered\_at.localeCompare(b.answered\_at));  
      for (const x of rs) { cur \= x.correct ? cur+1 : 0; max \= Math.max(max, cur); }  
      return max;  
    })();  
    const totalScore \= rs.reduce((a,b)=\>a+(b.score||0),0);  
    return { ck, attempts, correct\_count: correct, avg\_time\_ms: avgTime, best\_streak: bestStreak, total\_score: totalScore };  
  }).sort((a,b)=\>  
    (b.correct\_count \- a.correct\_count) ||  
    (a.avg\_time\_ms \- b.avg\_time\_ms) ||  
    (b.attempts \- a.attempts)  
  );  
}

function renderCards(items) {  
  const el \= document.getElementById("cards");  
  el.innerHTML \= items.map(x \=\> \`  
    \<article style="border:1px solid \#ddd;padding:12px;margin:8px 0;border-radius:8px"\>  
      \<h3 style="margin:0 0 6px 0"\>${x.ck}\</h3\>  
      \<p\>正答 ${x.correct\_count}/${x.attempts}（平均 ${Math.round(x.avg\_time\_ms)}ms）/ 最高連続 ${x.best\_streak} / スコア ${x.total\_score}\</p\>  
    \</article\>  
  \`).join("");  
}

(function main(){  
  const rows \= loadLocal();  
  const items \= summarizeByCK(rows);  
  renderCards(items);  
})();

グラフ描画を行う場合も、**Noto Sans JP** を使う（CSS既定フォントでOK）。数値は全角/半角が混ざらないよう注意。

---

## **バックエンド（GAS：Google Apps Script）**

**スプレッドシート構成**

* `RESULTS`（列）:  
   `answered_at, uid, session_id, E, I, J, K, ck, qid, correct, time_ms, score, app_ver, ua`

* `manual_fix_queue`（列）:  
   `answered_at, uid, session_id, raw_filename, note`

**Web App（doPost/doGet）**

// doPost: 結果の受領  
function doPost(e) {  
  try {  
    var body \= JSON.parse(e.postData.contents);  
    var events \= Array.isArray(body.events) ? body.events : \[body\];  
    var ss \= SpreadsheetApp.getActive();  
    var sh \= ss.getSheetByName("RESULTS");  
    var mq \= ss.getSheetByName("manual\_fix\_queue");

    var rows \= \[\];  
    var now \= new Date();  
    events.forEach(function(ev) {  
      if (ev.ck && ev.E && ev.I && ev.J && ev.K) {  
        rows.push(\[  
          ev.answered\_at || now.toISOString(),  
          ev.uid||"", ev.session\_id||"",  
          ev.E, ev.I, ev.J, ev.K, ev.ck,  
          ev.qid||"", ev.correct===true, Number(ev.time\_ms||0), Number(ev.score||0),  
          ev.app\_ver||"", ev.ua||""  
        \]);  
      } else {  
        if (mq) mq.appendRow(\[now.toISOString(), ev.uid||"", ev.session\_id||"", ev.\_\_manual\_fix\_\_||"", "missing CK"\]);  
      }  
    });  
    if (rows.length) sh.getRange(sh.getLastRow()+1,1,rows.length,rows\[0\].length).setValues(rows);  
    return ContentService.createTextOutput(JSON.stringify({ ok:true, saved: rows.length }))  
      .setMimeType(ContentService.MimeType.JSON);  
  } catch(err) {  
    return ContentService.createTextOutput(JSON.stringify({ ok:false, error: String(err) }))  
      .setMimeType(ContentService.MimeType.JSON);  
  }  
}

// doGet: ランキング・マイ成績API  
function doGet(e) {  
  var p \= e.parameter || {};  
  if (p.path \=== "rankings") return rankings\_(p);  
  if (p.path \=== "mystats")  return mystats\_(p);  
  return ContentService.createTextOutput(JSON.stringify({ ok:false, error:"unknown path"}))  
    .setMimeType(ContentService.MimeType.JSON);  
}

function rankings\_(p) {  
  var ck \= p.ck || "";  
  var period \= p.period || "weekly";  
  if (\!ck) return json\_({ ok:false, error:"ck required" });

  var sh \= SpreadsheetApp.getActive().getSheetByName("RESULTS");  
  var values \= sh.getDataRange().getValues(); // 1行目ヘッダ想定ならスキップ調整  
  var now \= new Date(), from \= new Date(0);  
  if (period \=== "daily")  { from \= new Date(now.getFullYear(),now.getMonth(),now.getDate()); }  
  if (period \=== "weekly") {  
    var day \= (now.getDay()+6)%7; // 月曜基準  
    from \= new Date(now.getFullYear(),now.getMonth(),now.getDate()-day);  
  }

  // 列インデックス（header有無で調整）  
  var COL \= { answered\_at:1, uid:2, E:4, I:5, J:6, K:7, ck:8, correct:10, time\_ms:11, score:12 };  
  var rows \= \[\];  
  for (var i=2;i\<=values.length;i++) {  
    var v \= values\[i-1\];  
    if (String(v\[COL.ck-1\]) \!== ck) continue;  
    var dt \= new Date(v\[COL.answered\_at-1\]);  
    if (dt \< from) continue;  
    rows.push({  
      uid: String(v\[COL.uid-1\]),  
      correct: v\[COL.correct-1\] \=== true || String(v\[COL.correct-1\]) \=== "TRUE",  
      time\_ms: Number(v\[COL.time\_ms-1\] || 0),  
      score: Number(v\[COL.score-1\] || 0),  
      answered\_at: dt  
    });  
  }

  // uidごとに集計  
  var byUid \= {};  
  rows.forEach(function(r){  
    var o \= byUid\[r.uid\] || (byUid\[r.uid\] \= { uid:r.uid, attempts:0, correct\_count:0, sum\_time:0, total\_score:0, last:r.answered\_at });  
    o.attempts++; if (r.correct) o.correct\_count++;  
    o.sum\_time \+= r.time\_ms; o.total\_score \+= r.score;  
    if (r.answered\_at \> o.last) o.last \= r.answered\_at;  
  });  
  var items \= Object.values(byUid).map(function(o){  
    return {  
      uid: o.uid,  
      attempts: o.attempts,  
      correct\_count: o.correct\_count,  
      avg\_time\_ms: o.sum\_time / Math.max(1,o.attempts),  
      total\_score: o.total\_score,  
      last\_answered\_at: o.last  
    };  
  }).filter(function(x){ return x.attempts \>= 3; });

  items.sort(function(a,b){  
    return (b.correct\_count \- a.correct\_count) ||  
           (a.avg\_time\_ms \- b.avg\_time\_ms) ||  
           (b.attempts \- a.attempts) ||  
           (b.last\_answered\_at \- a.last\_answered\_at);  
  });

  return json\_({ ok:true, items: items.slice(0, 100\) });  
}

function mystats\_(p) {  
  var uid \= p.uid || "";  
  if (\!uid) return json\_({ ok:false, error:"uid required" });  
  var sh \= SpreadsheetApp.getActive().getSheetByName("RESULTS");  
  var values \= sh.getDataRange().getValues();  
  var COL \= { uid:2, ck:8, correct:10, time\_ms:11, score:12, answered\_at:1 };

  var rows \= \[\];  
  for (var i=2;i\<=values.length;i++) {  
    var v \= values\[i-1\];  
    if (String(v\[COL.uid-1\]) \!== uid) continue;  
    rows.push({  
      ck: String(v\[COL.ck-1\]),  
      correct: v\[COL.correct-1\] \=== true || String(v\[COL.correct-1\]) \=== "TRUE",  
      time\_ms: Number(v\[COL.time\_ms-1\] || 0),  
      score: Number(v\[COL.score-1\] || 0),  
      answered\_at: new Date(v\[COL.answered\_at-1\])  
    });  
  }  
  // CKごとの集計と日次集計はフロント側と同等の要領で生成して返す（省略可）  
  return json\_({ ok:true, rows: rows });  
}

function json\_(obj) {  
  return ContentService.createTextOutput(JSON.stringify(obj))  
    .setMimeType(ContentService.MimeType.JSON);  
}

**ポイント**：`ck/E/I/J/K` が **空なら保存しない**（manual\_fix\_queueへ）。「完全一致」の厳格運用を担保。

---

## **テスト & 検証**

1. **ユニット**：`parseFilenameEijk()`

   * OK例：`HL001_ｱｲｸﾛｰｾﾞｯﾄ_ちびこっぺぱん_1day_lens.jpg` → CK生成

   * NG例：アンダースコア3個未満 → `null`

2. **E2E**：回答 → ローカル保存 → GASへPOST → RESULTS追記 → ランキング反映

3. **除外確認**：CK不在／パース不能は manual\_fix\_queue のみ増え、ランキング未反映

4. **表示**：`docs/ranking.html` と `docs/my-stats.html` が CK単位で整合していること

5. **フォント**：**Noto Sans JP** が反映され、日本語の文字化けが無いこと

---

## **変更ファイルと具体コマンド（例）**

\# 1\) ブランチ  
git checkout \-b feat/rank-mystats-ck

\# 2\) 追加/更新  
mkdir \-p docs/{assets/fonts,css,js}  
\# → フォント（NotoSansJP-Regular.woff2）を docs/assets/fonts/ へ配置  
\# → base.css, common.js, ranking.html, js/ranking.js, my-stats.html, js/my-stats.js を作成

git add docs  
git commit \-m "feat: ランキング/マイ成績をE|I|J|K完全一致で集計するUI/JSを追加"

\# 3\) GAS スクリプト更新（スプレッドシートに貼付、Web App 再デプロイ）  
\#    デプロイID（【GAS\_DEPLOY\_ID】）を ranking.js / common.js に反映  
git commit \-am "chore: GASエンドポイント反映"

\# 4\) プッシュ & PR  
git push origin feat/rank-mystats-ck

---

## **ロールバック**

* 直前の変更コミットを `git revert <commit>`。

* GAS：新デプロイリビジョンを「前のバージョン」に切替。

---

## **運用と今後**

* **厳格化の徹底**：CK一致のみ集計。マスターと突合する場合は別途CKリストを維持。

* **旧データの扱い**：後方互換が必要なら、G→CK 付与ジョブでRESULTSにCKを埋めてから再集計。

* **監視**：manual\_fix\_queue の件数を定期確認し、命名逸脱や漏れを是正。

* **開発方針**：ローカル→GitHub→自動化の一貫手順で継続（AI主導の作業進行）。

---

### **付記：UIの参考**

* 既存ワイヤーフレーム/総合イメージのコンポーネント間隔・カード構成を踏襲（見出し階層、カードの余白・角丸、ボタン配置など）。

---

以上です。これで **ランキング** と **マイ成績** は **E/I/J/K 完全一致** を中核に安定して収集・表示できるようになります。必要なら、そのままこのMDを `docs/` 直下（例：`docs/spec-ranking-mystats-ck.md`）に追加してナレッジ化してください。

