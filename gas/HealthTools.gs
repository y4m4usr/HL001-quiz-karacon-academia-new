// ====== HealthTools.gs（入口とAPIルーター） ======
function doGet(e) {
  if (e && e.parameter && e.parameter.asset === 'css') {
    const css = HtmlService.createHtmlOutputFromFile('css').getContent();
    return ContentService.createTextOutput(css).setMimeType(ContentService.MimeType.CSS);
  }
  return HtmlService.createTemplateFromFile('index').evaluate();
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function doGet(e){
  const t = HtmlService.createTemplateFromFile('index');
  // ← APP は必ず用意（未定義対策）
  t.APP = { NAME: 'ホテラバ Quiz☆カラコンアカデミア', API_VERSION: '2.1.0' };
  return t.evaluate()
          .setTitle(t.APP.NAME)
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 重要: google.script.run.api(...) で呼ばれるエンドポイントはトップレベルで定義
function api(payload){ /* 既存のルーター実装をここに */ }


      case 'gradeQuiz': {
        const { answers } = payload;
        const master = loadMaster_();
        const map = new Map(master.map(m => [ qidFromKey_(m.key), m ]));
        const hash2Label = new Map(master.map(m => [ oidFromKey_(m.key), `${m.brandKana}｜${m.colorKana}` ]));
        let correct = 0; const per = [];
        for (const a of answers) {
          const m = map.get(a.qid); if (!m) continue;
          const isCorrect = (a.oid === oidFromKey_(m.key));
          if (isCorrect) correct++;
          per.push({ qid:a.qid, isCorrect, correctLabel:`${m.brandKana}｜${m.colorKana}`, chosenLabel:(hash2Label.get(a.oid)||''), tMs:a.tMs||0, h1:!!a.h1, h2:!!a.h2 });
        }
        const { score } = scoreQuiz_(per.map(x => ({ isCorrect:x.isCorrect, h1:x.h1, h2:x.h2 })));
        return { ok:true, score, total: per.length, correct, per };
      }

      case 'submitResult': {
        const { quizId, staffId, userName, mode, result } = payload;
        const sh = shGet_(CFG.QUIZ_HISTORY_BOOK_ID, CFG.SHEETS_RUNTIME.QUIZ_HISTORY);
        if (sh.getLastRow()===0) sh.appendRow(['実施日時','スタッフ番号','ユーザー名','スコア','総問題数','正解数','総回答時間','平均回答時間','詳細(JSON)']);
        const totalMs = (result.per||[]).reduce((s,x)=>s+(x.tMs||0),0);
        const avgMs = result.per && result.per.length ? Math.round(totalMs/result.per.length) : 0;
        sh.appendRow([new Date(), staffId, userName, result.score, result.total, result.correct, totalMs, avgMs, JSON.stringify({quizId, mode, per:result.per})]);
        updateRanking_(staffId, userName, result.score);
        return { ok:true };
      }

      case 'getRanking': {
        const sh = shGet_(CFG.RANKINGS_BOOK_ID, CFG.SHEETS_RUNTIME.RANKINGS);
        return { ok:true, rows: sh.getDataRange().getValues() };
      }

      case 'getMyPage': {
        const sh = shGet_(CFG.QUIZ_HISTORY_BOOK_ID, CFG.SHEETS_RUNTIME.QUIZ_HISTORY);
        const v = sh.getDataRange().getValues(); const head=v.shift()||[];
        const idxId=head.indexOf('スタッフ番号'), idxScore=head.indexOf('スコア'), idxDt=head.indexOf('実施日時');
        const mine = v.filter(r=>String(r[idxId])===String(payload.staffId)).slice(-10);
        const avg = mine.length ? Math.round(mine.reduce((s,r)=>s+Number(r[idxScore]||0),0)/mine.length) : 0;
        return { ok:true, summary:{ recentAvg:avg, recentCount:mine.length }, trend:mine.map(r=>({ dt:r[idxDt], score:r[idxScore] })), weaknesses:[] };
      }

      case 'resetDaily': {
        const r = doResetDaily_(payload.staffId);
        return r.ok ? { ok:true, remainingReset:r.remainingReset } : { ok:false, error:'リセット上限に達しています', remainingReset:r.remainingReset };
      }

      default:
        return { ok:false, error:'unknown action' };
    }
  } catch (e) {
    return { ok:false, error: String(e) };
  }
}

// ====== 配線テスト（任意） ======
function healthPing(){ return 'pong'; }
