// extension/content/login-bridge.js

// 送信用ユーティリティ：lastError 吸収 + タイムアウト
function sendMessageSafe(message, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; reject(new Error('sendMessage timeout')); }
    }, timeoutMs);

    chrome.runtime.sendMessage(message, (resp) => {
      const err = chrome.runtime.lastError;
      if (settled) return;
      settled = true; clearTimeout(timer);

      if (err) {
        const benign = /message port closed|Receiving end does not exist/i.test(err.message || '');
        return benign ? resolve(null) : reject(err);
      }
      resolve(resp ?? null);
    });
  });
}

// ページ→拡張：ログイン開始通知（返信は待たない＝fire-and-forget）
window.addEventListener('message', (evt) => {
  if (evt.source !== window) return;
  const data = evt.data;
  if (!data || data.source !== 'page' || data.type !== 'LOGIN_START') return;

  // 返信は不要（待たない）— ポート閉鎖エラーを無害化
  chrome.runtime.sendMessage({ type: 'LOGIN_START' }, () => void chrome.runtime.lastError);
});

// 必要に応じて、ページからトークン要求 → 応答保証で返す例
window.addEventListener('message', async (evt) => {
  if (evt.source !== window) return;
  const data = evt.data;
  if (!data || data.source !== 'page' || data.type !== 'LOGIN_TOKEN_REQUEST') return;

  try {
    const resp = await sendMessageSafe({ type: 'LOGIN_TOKEN' }, 8000);
    window.postMessage({ source: 'content', type: 'LOGIN_TOKEN_RESPONSE', payload: resp }, '*');
  } catch (e) {
    window.postMessage({ source: 'content', type: 'LOGIN_TOKEN_RESPONSE', error: String(e) }, '*');
  }
});
