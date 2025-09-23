
// ===================================================================
// Webアプリ エントリーポイント
// ===================================================================
function doGet(e) {
  return HtmlService.createTemplateFromFile('index') // v1.7: gas/ディレクトリ内を参照
      .evaluate()
      .setTitle('Quiz☆カラコンアカデミア')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ===================================================================
// 画像プロキシ関数
// ===================================================================
function getGitHubImageAsBase64(githubUrl) {
  if (!githubUrl || typeof githubUrl !== 'string' || !githubUrl.startsWith('https://raw.githubusercontent.com')) {
    return { success: false, error: 'Invalid GitHub URL: ' + githubUrl };
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = 'github_base64_' + githubUrl;
  const cached = cache.get(cacheKey);

  if (cached) {
    return JSON.parse(cached);
  }

  try {
    const response = UrlFetchApp.fetch(githubUrl, { muteHttpExceptions: true });
    const responseCode = response.getResponseCode();

    if (responseCode !== 200) {
      throw new Error(`GitHub returned status ${responseCode} for ${githubUrl}`)
    }

    const blob = response.getBlob();
    const base64 = Utilities.base64Encode(blob.getBytes());
    const mimeType = blob.getContentType();
    
    const result = {
      success: true,
      data: `data:${mimeType};base64,${base64}`
    };
    
    const jsonResult = JSON.stringify(result);
    cache.put(cacheKey, jsonResult, 21600); // 6時間キャッシュ

    return result;

  } catch (err) {
    console.error("GitHub Image proxy error for URL " + githubUrl + ": " + err.toString());
    return { success: false, error: err.message };
  }
}
