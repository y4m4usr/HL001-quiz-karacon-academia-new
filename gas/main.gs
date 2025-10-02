// ===================================================================
// Webアプリ ルーター + 画面ブートストラップ
// ===================================================================
function index_() {
  // IFRAME サンドボックスで外部読み込みに強い表示
  const html = HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Quiz☆カラコンアカデミア')
    .setSandboxMode(HtmlService.SandboxMode.IFRAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return html;
}

function doGet(e) {
  const p = e && e.parameter || {};
  // API
  if (p.action) {
    if (p.action === 'items')    return items_();
    if (p.action === 'health')   return health_();
    if (typeof rankings_ === 'function' && p.action === 'rankings') return rankings_(p);
    if (typeof mystats_  === 'function' && p.action === 'mystats')  return mystats_(p);
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:'unknown action'}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  // 画面
  return index_();
}

function doPost(e){
  try{
    const body = e?.postData?.contents ? JSON.parse(e.postData.contents) : (e?.parameter||{});
    if (typeof submit_ === 'function' && body.action === 'submit') return submit_(body);
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:'unknown action'}))
      .setMimeType(ContentService.MimeType.JSON);
  }catch(err){
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:String(err)}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
