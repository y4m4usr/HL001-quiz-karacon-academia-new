// gas/AuthRank.gs
function authenticateUser_(staffId, userName) {
  const sh = shGet_(CFG.USERS_BOOK_ID, CFG.SHEETS_RUNTIME.USERS);
  if (sh.getLastRow()===0) sh.appendRow(['スタッフ番号','氏名','部署','権限','最終ログイン','登録日','状態']);
  const v = sh.getDataRange().getValues(); const head = v.shift();
  const idxId = head.indexOf('スタッフ番号'), idxNm=head.indexOf('氏名'), idxRole=head.indexOf('権限'), idxLast=head.indexOf('最終ログイン');
  let rowIdx = -1;
  for (let i=0;i<v.length;i++){ if (String(v[i][idxId])===staffId){ rowIdx=i+2; break; } }
  const now = new Date();
  if (rowIdx<0){
    rowIdx = sh.getLastRow()+1;
    sh.appendRow([staffId, userName, '', 'role_baito', now, now, 'active']);
  } else {
    sh.getRange(rowIdx, idxNm+1).setValue(userName);
    sh.getRange(rowIdx, idxLast+1).setValue(now);
  }
  const role = sh.getRange(rowIdx, idxRole+1).getValue() || 'role_baito';
  return { staffId, name:userName, role };
}

function createSession_(staffId, mode, questions) {
  const sh = shGet_(CFG.QUIZ_HISTORY_BOOK_ID, CFG.SHEETS_RUNTIME.QUIZ_SESS);
  if (sh.getLastRow()===0) sh.appendRow(['createdAt','date','staffId','mode','quizId','limit','timePerQ','usedReset','state']);
  const quizId = 'qz_' + Date.now() + '_' + Math.floor(Math.random()*1e6);
  const dstr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  sh.appendRow([new Date(), dstr, staffId, mode, quizId, (CFG.TOTAL_QUESTIONS||10), CFG.TIME_PER_Q_SEC, 0, 'active']);
  return quizId;
}

function canStartDaily_(staffId) {
  const sh = shGet_(CFG.QUIZ_HISTORY_BOOK_ID, CFG.SHEETS_RUNTIME.QUIZ_SESS);
  const v = sh.getDataRange().getValues(); if (v.length<=1) return { ok:true, remainingReset: CFG.DAILY_RESET_MAX };
  const head = v.shift(); const idxDate=head.indexOf('date'), idxId=head.indexOf('staffId'), idxMode=head.indexOf('mode'), idxState=head.indexOf('state'), idxReset=head.indexOf('usedReset');
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const rec = v.filter(r=> String(r[idxId])===staffId && String(r[idxMode])==='daily' && String(r[idxDate])===today && String(r[idxState])==='active');
  if (rec.length===0) return { ok:true, remainingReset: CFG.DAILY_RESET_MAX };
  return { ok:false, remainingReset: Math.max(0, CFG.DAILY_RESET_MAX - Number(rec[0][idxReset]||0)) };
}

function doResetDaily_(staffId) {
  const sh = shGet_(CFG.QUIZ_HISTORY_BOOK_ID, CFG.SHEETS_RUNTIME.QUIZ_SESS);
  const v = sh.getDataRange().getValues(); if (v.length<=1) return { ok:false, remainingReset:0 };
  const head=v.shift(); const idxDate=head.indexOf('date'), idxId=head.indexOf('staffId'), idxState=head.indexOf('state'), idxReset=head.indexOf('usedReset');
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  for (let i=0;i<v.length;i++){
    const r=v[i];
    if (String(r[idxId])===staffId && String(r[idxDate])===today && String(r[idxState])==='active'){
      const used = Number(r[idxReset]||0);
      if (used>=CFG.DAILY_RESET_MAX) return { ok:false, remainingReset:0 };
      sh.getRange(i+2, idxState+1).setValue('reset');
      sh.getRange(i+2, idxReset+1).setValue(used+1);
      return { ok:true, remainingReset: CFG.DAILY_RESET_MAX - (used+1) };
    }
  }
  return { ok:false, remainingReset:0 };
}

function updateRanking_(staffId, userName, score) {
  const sh = shGet_(CFG.RANKINGS_BOOK_ID, CFG.SHEETS_RUNTIME.RANKINGS);
  if (sh.getLastRow()===0) sh.appendRow(['スタッフ番号','ユーザー名','ハイスコア','総プレイ回数','練習モード回数','総スコア','平均スコア','最終更新日時']);
  const v=sh.getDataRange().getValues(); const head=v.shift();
  const idxId=head.indexOf('スタッフ番号'), idxNm=head.indexOf('ユーザー名'), idxHigh=head.indexOf('ハイスコア'), idxCnt=head.indexOf('総プレイ回数'), idxSum=head.indexOf('総スコア'), idxAvg=head.indexOf('平均スコア'), idxPrac=head.indexOf('練習モード回数');
  let row=-1;
  for(let i=0;i<v.length;i++){ if (String(v[i][idxId])===staffId){ row=i+2; break; } }
  const now=new Date();
  if (row<0){
    sh.appendRow([staffId,userName,score,1,0,score,score,now]);
  } else {
    const curHigh = Number(sh.getRange(row, idxHigh+1).getValue()||0);
    const cnt = Number(sh.getRange(row, idxCnt+1).getValue()||0)+1;
    const sum = Number(sh.getRange(row, idxSum+1).getValue()||0)+score;
    sh.getRange(row, idxNm+1).setValue(userName);
    sh.getRange(row, idxHigh+1).setValue(Math.max(curHigh, score));
    sh.getRange(row, idxCnt+1).setValue(cnt);
    sh.getRange(row, idxSum+1).setValue(sum);
    sh.getRange(row, idxAvg+1).setValue(Math.round((sum/cnt)*10)/10);
    sh.getRange(row, head.indexOf('最終更新日時')+1).setValue(now);
  }
}

