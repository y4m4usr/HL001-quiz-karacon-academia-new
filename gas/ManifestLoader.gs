/** =========================
 * ManifestLoader.gs
 *  - GitHub manifests (lens.json / samune.json) ロード & キャッシュ
 *  - strict: manifest に存在する key のみを有効とする
 *  - v1.8準拠：X=レンズ、W=サムネ（サムネは任意／正解時のフィードバック用）
 * ========================= */

const MANIFEST_CACHE_KEY = 'manifest:v1:lens+samune';
const MANIFEST_TTL_SEC  = 6 * 60 * 60; // 6h

/**
 * GitHub 画像基底設定を取得。
 * 既存の Config.gs に持たせている場合はそちらを参照してください。
 */
function getGitHubImageCfg_() {
  // ▼Config.gs に以下のような定義がある想定。無ければ直値で置き換え。
  //   CONFIG.GITHUB = { OWNER:'...', REPO:'...', BRANCH:'main',
  //                     LENS_BASE:'images/lens_shard',
  //                     SAMUNE_BASE:'images/samune_shard' }
  const c = (typeof CONFIG !== 'undefined' && CONFIG.GITHUB) ? CONFIG.GITHUB : null;
  if (!c) throw new Error('CONFIG.GITHUB が未設定です');
  return {
    owner:      c.OWNER,
    repo:       c.REPO,
    branch:     c.BRANCH,
    lensBase:   c.LENS_BASE,
    samuneBase: c.SAMUNE_BASE
  };
}

/** raw / cdn の URL ヘルパ */
function buildRawUrl_(cfg, path) {
  return `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${path}`;
}
function buildCdnUrl_(cfg, path) {
  return `https://cdn.jsdelivr.net/gh/${cfg.owner}/${cfg.repo}@${cfg.branch}/${path}`;
}

/** HTTP GET + JSON 解析（フォールバック付き） */
function fetchJsonWithFallback_(rawUrl, cdnUrl) {
  const opt = {muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: true};
  // raw 優先
  try {
    const res = UrlFetchApp.fetch(rawUrl, opt);
    if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
      return JSON.parse(res.getContentText('utf-8'));
    }
  } catch (e) { /* fall through */ }
  // cdn フォールバック
  const res2 = UrlFetchApp.fetch(cdnUrl, opt);
  if (res2.getResponseCode() >= 200 && res2.getResponseCode() < 300) {
    return JSON.parse(res2.getContentText('utf-8'));
  }
  throw new Error('manifests を取得できませんでした: ' + rawUrl);
}

/** マニフェストをロード（キャッシュあり） */
function getManifestStore_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(MANIFEST_CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* 破損は捨てる */ } 
  }

  const cfg = getGitHubImageCfg_();
  const lensRaw = buildRawUrl_(cfg, 'manifests/lens.json');
  const lensCdn = buildCdnUrl_(cfg, 'manifests/lens.json');
  const samRaw  = buildRawUrl_(cfg, 'manifests/samune.json');
  const samCdn  = buildCdnUrl_(cfg, 'manifests/samune.json');

  const lens = fetchJsonWithFallback_(lensRaw, lensCdn);   // { key: {file, shard, sha256, w, h}, ... }
  const sam  = fetchJsonWithFallback_(samRaw,  samCdn);    // 同上

  const store = { lens, sam, cfg, fetchedAt: new Date().toISOString() };
  cache.put(MANIFEST_CACHE_KEY, JSON.stringify(store), MANIFEST_TTL_SEC);
  return store;
}

/** 明示的にキャッシュを無効化（管理用） */
function invalidateManifestCache_() {
  CacheService.getScriptCache().remove(MANIFEST_CACHE_KEY);
}

/** key（code|brand|color|period）→ レンズ画像URL（preferred/raw と fallbacks/cdn） */
function buildLensImageUrlsFromEntry_(entry, cfg) {
  const path = entry.path ? entry.path : `${cfg.lensBase}/${entry.shard}/${entry.file}`;
  const preferred = buildRawUrl_(cfg, path);
  const cdn = buildCdnUrl_(cfg, path);
  return { preferred, fallbacks: [cdn] };
}

/** key → サムネURL（存在すれば） */
function buildSamuneUrlFromEntry_(entry, cfg) {
  const path = entry.path ? entry.path : `${cfg.samuneBase}/${entry.shard}/${entry.file}`;
  return buildRawUrl_(cfg, path); // UI側で raw→cdn フォールバックを担保する方針
}
