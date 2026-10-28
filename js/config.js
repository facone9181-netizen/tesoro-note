/* pharmarom tesoro — 설정 (웹앱 주소·토큰 등) */
window.CONFIG = (function () {
  'use strict';
  var LS = 'tesoro.cfg';
  // 기본 백엔드 주소를 미리 넣어두면 어느 기기에서 열어도 설정 없이 로그인만 하면 됨
  // (이 주소는 로그인 토큰이 있어야만 데이터를 돌려주므로 공개돼도 비밀번호 없이는 접근 불가)
  var DEFAULT_WEBAPP = 'https://script.google.com/macros/s/AKfycbxz2OqIqlz2iV8vt7-T8ZVGzRN7dxvtpOI3aWERLhXJabD5-K7MGVdbHdwP1zvbU7z7/exec';
  var def = { webAppUrl: DEFAULT_WEBAPP, token: '', lastSync: 0 };

  function load() {
    try {
      var raw = localStorage.getItem(LS);
      if (raw) return Object.assign({}, def, JSON.parse(raw));
    } catch (e) {}
    return Object.assign({}, def);
  }
  var state = load();

  function save() {
    try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) {}
  }
  return {
    get: function (k) { return state[k]; },
    set: function (k, v) { state[k] = v; save(); },
    all: function () { return state; },
    hasBackend: function () { return !!state.webAppUrl; },
    isLoggedIn: function () { return !!state.webAppUrl && !!state.token; }
  };
})();
