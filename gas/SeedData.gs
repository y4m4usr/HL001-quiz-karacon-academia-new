/** SPEC-LOCK: DEV ユーティリティ（本番は無効: DEV_MODE=false） */
const DEV_MODE = false;

// いまの items_() で何問返るかの簡易チェック
function debugGetQuestionsCount(){
  const res = JSON.parse(items_().getContent());
  return { count: (res.items||[]).length };
}

// ダミーの submit を N 回投げてランキングをテスト（DEV専用）
function seedFakeSubmits_(n){
  if (!DEV_MODE) return 'disabled';
  for (var i=0;i<n;i++){
    var ok = (i%2===0);
    var payload = {
      action: 'submit',
      uid: 'dev-user',
      session_id: 'sess-'+i,
      // ここは items_() から取得した正答の一例を流用すると良いです
      E:'E_SAMPLE', I:'I_SAMPLE', J:'J_SAMPLE', K:'1day',
      qid:'CK:E_SAMPLE|I_SAMPLE|J_SAMPLE|1day',
      correct: ok,
      time_ms: Math.floor(1000+Math.random()*3000),
      score: ok ? 10 : 0,
      app_ver: 'dev',
      ua: 'seed'
    };
    submit_(payload);
  }
  return 'seeded';
}
