// extension/service_worker.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'LOGIN_TOKEN') {
    (async () => {
      try {
        const token = await fetch('https://your-api.example.com/api/token', {
          credentials: 'include'
        }).then(r => r.json());

        sendResponse({ ok: true, token });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true; // ★ 非同期応答を行うのでポートを開けたままにする
  }

  if (msg?.type === 'LOGIN_START') {
    // 返信必須でないお知らせ系。空で応答しておくと安全
    sendResponse({ ok: true });
    // ここでログを残したり、preload したりしてもOK
  }
});
