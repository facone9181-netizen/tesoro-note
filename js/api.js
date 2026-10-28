/* pharmarom tesoro — Apps Script 백엔드 호출 */
window.API = (function () {
  'use strict';

  // Apps Script는 CORS preflight를 피하려 text/plain 본문으로 POST (단순요청)
  function call(payload) {
    var url = CONFIG.get('webAppUrl');
    if (!url) return Promise.reject(new Error('no-backend'));
    payload = payload || {};
    if (CONFIG.get('token')) payload.token = CONFIG.get('token');
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res && res.error === 'auth') {
        CONFIG.set('token', '');
        throw new Error('auth');
      }
      return res;
    });
  }

  return {
    ping: function () { return call({ action: 'ping' }); },
    login: function (pw) {
      return call({ action: 'login', pw: pw }).then(function (res) {
        if (res && res.ok && res.token) { CONFIG.set('token', res.token); return res; }
        throw new Error(res && res.error ? res.error : 'login-failed');
      });
    },
    logout: function () { CONFIG.set('token', ''); return Promise.resolve(); },
    pull: function (since) { return call({ action: 'pull', since: since || 0 }); },
    push: function (changes) { return call({ action: 'push', changes: changes }); },
    // 사진 업로드 + 서버 OCR (드라이브 OCR). 멱등키 photoId.
    uploadPhoto: function (photoId, base64) { return call({ action: 'uploadPhoto', photoId: photoId, data: base64 }); },
    ocr: function (photoId) { return call({ action: 'ocr', photoId: photoId }); },
    // 인증된 사진 데이터(base64) 조회 — 공개 URL 미노출
    photo: function (photoFileId) { return call({ action: 'photo', photoFileId: photoFileId }); },
    searchBooks: function (q) { return call({ action: 'search', q: q }); },
    call: call
  };
})();
