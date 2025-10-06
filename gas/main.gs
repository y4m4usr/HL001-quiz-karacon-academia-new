// ===================================================================
// 画面ブートストラップ
// ===================================================================
function index_() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Quiz☆カラコンアカデミア')
    .setSandboxMode(HtmlService.SandboxMode.IFRAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
