/* pharmarom tesoro — 메인 UI & 라우팅 */
window.App = (function () {
  'use strict';
  var root, header;
  var state = { screen: 'library', bookId: null, librarySort: 'month', libraryFilter: 'all', bookSort: 'record', jumpBlock: null };
  var editors = {}; // id -> editor instance

  // ---------- 작은 유틸 ----------
  function h(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c == null) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function toast(msg, kind) {
    var t = h('div', { class: 'toast ' + (kind || '') , text: msg });
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 10);
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 2600);
  }
  function confirmDialog(msg, danger) {
    return new Promise(function (res) {
      var ov = h('div', { class: 'modal-ov' });
      var box = h('div', { class: 'modal' }, [
        h('p', { class: 'modal-msg', text: msg }),
        h('div', { class: 'modal-btns' }, [
          h('button', { class: 'btn ghost', onclick: function () { ov.remove(); res(false); } }, ['취소']),
          h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: function () { ov.remove(); res(true); } }, ['확인'])
        ])
      ]);
      ov.appendChild(box); document.body.appendChild(ov);
    });
  }
  function modal(contentNode, opts) {
    opts = opts || {};
    var ov = h('div', { class: 'modal-ov', onclick: function (e) { if (e.target === ov && !opts.sticky) close(); } });
    var box = h('div', { class: 'modal ' + (opts.wide ? 'wide' : '') });
    if (opts.title) box.appendChild(h('div', { class: 'modal-head' }, [h('h3', { text: opts.title }), h('button', { class: 'x', onclick: close, text: '✕' })]));
    box.appendChild(contentNode);
    ov.appendChild(box); document.body.appendChild(ov);
    function close() { ov.remove(); if (opts.onClose) opts.onClose(); }
    return { close: close, box: box };
  }

  // ---------- 동기화 배지 ----------
  function syncBadge() {
    var s = Sync.getState();
    var map = {
      idle: ['', ''], saving: ['저장 중', 'saving'], synced: ['동기화 완료', 'synced'],
      offline: ['오프라인', 'offline'], error: ['동기화 실패', 'error']
    };
    var conf = Sync.getConflicts();
    var label = map[s] ? map[s][0] : '';
    var cls = map[s] ? map[s][1] : '';
    if (!CONFIG.hasBackend()) { label = '로컬 전용'; cls = 'local'; }
    else if (!CONFIG.isLoggedIn()) { label = '로그인 필요'; cls = 'offline'; }
    if (conf.length) { label = '충돌 ' + conf.length + '건'; cls = 'error'; }
    var badge = h('button', { class: 'sync-badge ' + cls, onclick: function () { if (conf.length && App.showConflicts) App.showConflicts(); else if (!CONFIG.isLoggedIn() && CONFIG.hasBackend()) go('settings'); else Sync.flush(); } }, [label || '…']);
    return badge;
  }
  function refreshBadge() {
    var old = header.querySelector('.sync-badge');
    if (old) old.replaceWith(syncBadge());
  }

  // ---------- 헤더 ----------
  function renderHeader() {
    clear(header);
    var nav = h('div', { class: 'hd-inner' }, [
      h('button', { class: 'brand', onclick: function () { go('library'); } }, [
        h('img', { src: 'assets/logo.jpg', alt: 'Pharmarom', class: 'brand-logo' }),
        h('span', { class: 'brand-name', text: 'tesoro' })
      ]),
      h('div', { class: 'hd-actions' }, [
        h('button', { class: 'ico', title: '전체 검색', onclick: function () { go('search'); }, html: svg('search') }),
        h('button', { class: 'ico', title: '설정', onclick: function () { go('settings'); }, html: svg('gear') }),
        syncBadge()
      ])
    ]);
    header.appendChild(nav);
  }
  function svg(n) {
    var p = {
      search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
      gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
      camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
      image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
      pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
      star: '<polygon points="12 2 15 9 22 9.3 17 14 18.5 21 12 17.3 5.5 21 7 14 2 9.3 9 9"/>',
      up: '<polyline points="18 15 12 9 6 15"/>', down: '<polyline points="6 9 12 15 18 9"/>',
      trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
      copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
      back: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
      plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (p[n] || '') + '</svg>';
  }

  // ---------- 라우팅 ----------
  function go(screen, opts) {
    opts = opts || {};
    state.screen = screen;
    if (opts.bookId !== undefined) state.bookId = opts.bookId;
    if (opts.jumpBlock !== undefined) state.jumpBlock = opts.jumpBlock;
    Object.keys(editors).forEach(function (k) { try { editors[k].destroy(); } catch (e) {} });
    editors = {};
    window.scrollTo(0, 0);
    render();
  }

  function render() {
    renderHeader();
    clear(root);
    if (state.screen !== 'login' && state.screen !== 'settings' && CONFIG.hasBackend() && !CONFIG.isLoggedIn()) { renderLogin(); return; }
    var fn = App.screens[state.screen];
    (fn || renderLibrary)();
  }

  // ---------- 로그인 ----------
  function renderLogin() {
    header.style.display = 'none';
    var hasBackend = CONFIG.hasBackend();
    var pwInput;
    var card = h('div', { class: 'login-card' }, [
      h('img', { src: 'assets/logo.jpg', alt: 'Pharmarom', class: 'login-logo' }),
      h('div', { class: 'login-title', text: 'pharmarom tesoro' }),
      h('div', { class: 'login-sub', text: '책 속의 문장, 나의 생각' }),
      hasBackend ? h('div', { class: 'login-form' }, [
        (pwInput = h('input', { type: 'password', placeholder: '비밀번호', class: 'inp', autocomplete: 'current-password' })),
        h('button', { class: 'btn primary wide', onclick: doLogin }, ['들어가기'])
      ]) : h('div', { class: 'login-form' }, [
        h('p', { class: 'muted small', text: '아직 백엔드(저장 서버)가 연결되지 않았습니다. 지금은 이 기기에만 저장됩니다. 연결하면 로그인·기기 간 동기화가 켜집니다.' }),
        h('button', { class: 'btn primary wide', onclick: function () { go('library'); } }, ['이 기기에서 바로 시작']),
        h('button', { class: 'btn ghost wide', onclick: function () { header.style.display = ''; go('settings'); } }, ['저장 서버 연결하기'])
      ])
    ]);
    if (pwInput) pwInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    root.appendChild(h('div', { class: 'login-wrap' }, [card]));
    function doLogin() {
      var pw = pwInput.value;
      if (!pw) { toast('비밀번호를 입력하세요'); return; }
      toast('로그인 중…');
      API.login(pw).then(function () {
        header.style.display = '';
        toast('환영합니다');
        return Sync.initialSync();
      }).then(function () { go('library'); refreshBadge(); })
        .catch(function (e) { toast(e.message === 'bad-pw' ? '비밀번호가 올바르지 않습니다' : '로그인 실패: ' + e.message, 'err'); });
    }
  }

  // ---------- 서재 ----------
  function renderLibrary() {
    header.style.display = '';
    Store.listBooks().then(function (books) {
      var counts = {};
      var chain = Promise.all(books.map(function (b) {
        return Store.countBlocks(b.id).then(function (c) { counts[b.id] = c; });
      }));
      chain.then(function () {
        clear(root);
        var toolbar = h('div', { class: 'lib-toolbar' }, [
          h('button', { class: 'btn primary', onclick: function () { go('add'); } }, [h('span', { html: svg('plus') }), '책 추가']),
          h('div', { class: 'spacer' }),
          sortSelect(), filterChips()
        ]);
        var container = h('div', { class: 'lib-body' });
        if (!books.length) {
          container.appendChild(h('div', { class: 'empty' }, [
            h('p', { text: '아직 서재가 비어 있어요.' }),
            h('p', { class: 'muted', text: '‘책 추가’로 첫 책을 등록해 보세요.' })
          ]));
        } else {
          var filtered = books.filter(function (b) { return state.libraryFilter === 'all' || b.status === state.libraryFilter; });
          if (state.librarySort === 'title') {
            filtered.sort(function (a, b) { return (a.title || '').localeCompare(b.title || '', 'ko'); });
            container.appendChild(bookGrid(filtered, counts));
          } else if (state.librarySort === 'updated') {
            filtered.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
            container.appendChild(bookGrid(filtered, counts));
          } else {
            // 월별 그룹
            var groups = {};
            filtered.forEach(function (b) { var k = b.readStartMonth || '__none'; (groups[k] = groups[k] || []).push(b); });
            var keys = Object.keys(groups).filter(function (k) { return k !== '__none'; }).sort().reverse();
            keys.forEach(function (k) {
              container.appendChild(h('h2', { class: 'month-h', text: U.monthLabel(k) }));
              container.appendChild(bookGrid(groups[k], counts));
            });
            if (groups.__none) {
              container.appendChild(h('h2', { class: 'month-h muted', text: '시작 월 미정' }));
              container.appendChild(bookGrid(groups.__none, counts));
            }
          }
        }
        root.appendChild(h('div', { class: 'page lib' }, [toolbar, container]));
      });
    });
  }
  function sortSelect() {
    var sel = h('select', { class: 'sel', onchange: function () { state.librarySort = sel.value; renderLibrary(); } }, [
      h('option', { value: 'month', text: '독서 시작 월별' }),
      h('option', { value: 'updated', text: '최근 수정순' }),
      h('option', { value: 'title', text: '제목순' })
    ]);
    sel.value = state.librarySort; return sel;
  }
  function filterChips() {
    var opts = [['all', '전체'], ['before', '읽기 전'], ['reading', '읽는 중'], ['done', '완독'], ['paused', '잠시 멈춤']];
    return h('div', { class: 'chips' }, opts.map(function (o) {
      return h('button', { class: 'chip' + (state.libraryFilter === o[0] ? ' on' : ''), onclick: function () { state.libraryFilter = o[0]; renderLibrary(); }, text: o[1] });
    }));
  }
  function bookGrid(books, counts) {
    return h('div', { class: 'book-grid' }, books.map(function (b) {
      var cover = h('div', { class: 'cover' });
      coverInto(cover, b);
      return h('button', { class: 'book-card', onclick: function () { go('book', { bookId: b.id }); } }, [
        cover,
        h('div', { class: 'bc-body' }, [
          h('div', { class: 'bc-title', text: b.title || '제목 없음' }),
          h('div', { class: 'bc-author muted', text: b.author || '' }),
          h('div', { class: 'bc-meta' }, [
            h('span', { class: 'badge status-' + b.status, text: U.statusLabels[b.status] }),
            h('span', { class: 'muted small', text: U.startLabel(b.readStartMonth) })
          ]),
          h('div', { class: 'bc-count muted small', text: '문장 블록 ' + (counts[b.id] || 0) + '개' })
        ])
      ]);
    }));
  }
  function coverInto(node, b) {
    clear(node);
    if (b.coverPhotoId) {
      Photo.photoObjectUrl(b.coverPhotoId).then(function (url) {
        if (url) node.appendChild(h('img', { src: url, class: 'cover-img' }));
        else fallbackCover();
      });
    } else if (b.coverUrl) {
      node.appendChild(h('img', { src: b.coverUrl, class: 'cover-img', onerror: fallbackCover }));
    } else fallbackCover();
    function fallbackCover() { clear(node); node.appendChild(h('div', { class: 'cover-ph', text: (b.title || '?').slice(0, 1) })); }
  }

  // 화면 레지스트리 (app2.js 가 add/book/search/settings/trash 를 채움)
  var screens = { login: renderLogin, library: renderLibrary };

  // 나머지 화면은 app2.js 에서 확장 (가독성 위해 분리)
  function init() {
    root = document.getElementById('view');
    header = document.getElementById('appHeader');
    Sync.on(function () { refreshBadge(); });
    // 초기 화면
    DB.metaGet('seeded').then(function () {
      if (CONFIG.hasBackend() && !CONFIG.isLoggedIn()) { go('login'); }
      else { go('library'); if (CONFIG.isLoggedIn()) Sync.initialSync(); }
    });
  }

  return {
    init: init, go: go, h: h, clear: clear, toast: toast, modal: modal, confirmDialog: confirmDialog,
    svg: svg, state: state, editors: editors, coverInto: coverInto, refreshBadge: refreshBadge,
    renderLibrary: renderLibrary, bookGrid: bookGrid, screens: screens
  };
})();
