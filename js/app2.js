/* pharmarom tesoro — 화면 확장 (add/book/search/settings/trash/conflicts) */
(function () {
  'use strict';
  var A = window.App;
  var h = A.h, go = A.go, toast = A.toast, svg = A.svg, clear = A.clear;

  function backBar(title, extra) {
    return h('div', { class: 'backbar' }, [
      h('button', { class: 'ico', onclick: function () { go('library'); }, html: svg('back') }),
      h('div', { class: 'bb-title', text: title }),
      h('div', { class: 'spacer' }),
      extra || null
    ]);
  }

  // =================== 책 추가 (검색 / 직접입력) ===================
  A.screens.add = function renderAdd() {
    var tab = 'search';
    var page = h('div', { class: 'page' });
    var body = h('div');
    function tabs() {
      return h('div', { class: 'tabs' }, [
        h('button', { class: 'tab' + (tab === 'search' ? ' on' : ''), onclick: function () { tab = 'search'; draw(); }, text: 'YES24 검색' }),
        h('button', { class: 'tab' + (tab === 'manual' ? ' on' : ''), onclick: function () { tab = 'manual'; draw(); }, text: '직접 입력' })
      ]);
    }
    function draw() {
      clear(page);
      page.appendChild(backBar('책 추가'));
      page.appendChild(tabs());
      clear(body); page.appendChild(body);
      if (tab === 'search') drawSearch(); else drawManual();
    }
    function drawSearch() {
      var input = h('input', { class: 'inp', placeholder: '제목 · 저자 · ISBN 검색', autofocus: true });
      var results = h('div', { class: 'search-results' });
      function run() {
        var q = input.value.trim();
        if (!q) return;
        if (!CONFIG.isLoggedIn()) {
          clear(results);
          results.appendChild(h('div', { class: 'notice' }, [
            h('p', { text: 'YES24 검색은 저장 서버(백엔드) 연결 후 가능합니다.' }),
            h('p', { class: 'muted small', text: '지금은 ‘직접 입력’으로 책을 등록할 수 있어요. (설정에서 서버를 연결하면 검색이 켜집니다.)' })
          ]));
          return;
        }
        clear(results); results.appendChild(h('div', { class: 'muted', text: '검색 중…' }));
        API.searchBooks(q).then(function (res) {
          clear(results);
          if (!res || !res.ok) { results.appendChild(h('div', { class: 'notice', text: '검색 실패: ' + ((res && res.error) || '') + ' — 직접 입력으로 등록하세요.' })); return; }
          var items = res.items || [];
          if (!items.length) { results.appendChild(h('div', { class: 'muted', text: '결과가 없습니다. 직접 입력으로 등록하세요.' })); return; }
          items.forEach(function (it) {
            results.appendChild(h('div', { class: 'sr-item' }, [
              it.cover ? h('img', { src: it.cover, class: 'sr-cover' }) : h('div', { class: 'cover-ph sr-cover', text: (it.title || '?').slice(0, 1) }),
              h('div', { class: 'sr-info' }, [
                h('div', { class: 'sr-title', text: it.title }),
                h('div', { class: 'muted small', text: [it.author, it.publisher].filter(Boolean).join(' · ') }),
                h('div', { class: 'muted small', text: it.isbn13 ? 'ISBN ' + it.isbn13 : '' }),
                h('div', { class: 'sr-src' }, [
                  h('span', { class: 'muted tiny', text: '출처: YES24' }),
                  it.link ? h('a', { href: it.link, target: '_blank', rel: 'noopener', class: 'tiny link', text: '상품 보기' }) : null
                ])
              ]),
              h('button', { class: 'btn primary sm', onclick: function () { openRegister(it, 'yes24'); }, text: '선택' })
            ]));
          });
        }).catch(function (e) { clear(results); results.appendChild(h('div', { class: 'notice', text: '검색 오류: ' + e.message } )); });
      }
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
      body.appendChild(h('div', { class: 'search-box' }, [input, h('button', { class: 'btn primary', onclick: run, text: '검색' })]));
      body.appendChild(results);
      setTimeout(function () { input.focus(); }, 50);
    }
    function drawManual() {
      openRegister({}, 'manual', body);
    }
    draw();
    A.clear(document.getElementById('view')); document.getElementById('view').appendChild(page);
  };

  // 등록/판본 확인 폼 (검색 결과 선택 후, 또는 직접입력)
  function openRegister(item, source, inlineHost) {
    var coverPhotoId = '';
    var coverBlob = null;
    var form = h('div', { class: 'reg-form' }, [
      field('제목', (fTitle = h('input', { class: 'inp', value: item.title || '' }))),
      field('저자', (fAuthor = h('input', { class: 'inp', value: item.author || '' }))),
      field('출판사', (fPub = h('input', { class: 'inp', value: item.publisher || '' }))),
      field('ISBN', (fIsbn = h('input', { class: 'inp', value: item.isbn13 || '' }))),
      h('div', { class: 'f-row' }, [
        h('div', { class: 'f' }, [h('label', { text: '독서 시작 — 연도' }), (fYear = yearSelect())]),
        h('div', { class: 'f' }, [h('label', { text: '월' }), (fMonth = monthSelect())])
      ]),
      field('독서 상태', (fStatus = statusSelect('before'))),
      coverField()
    ]);
    var fTitle, fAuthor, fPub, fIsbn, fYear, fMonth, fStatus;
    // (위 선언 호이스팅 때문에 실제 할당은 아래에서)
    function field(label, input) { return h('div', { class: 'f' }, [h('label', { text: label }), input]); }
    function yearSelect() {
      var now = new Date().getFullYear();
      var s = h('select', { class: 'sel' }, [h('option', { value: '', text: '미정' })].concat(
        range(now + 1, now - 30).map(function (y) { return h('option', { value: String(y), text: y + '년' }); })));
      return s;
    }
    function monthSelect() {
      var s = h('select', { class: 'sel' }, [h('option', { value: '', text: '미정' })].concat(
        range(1, 12).map(function (m) { return h('option', { value: (m < 10 ? '0' : '') + m, text: m + '월' }); })));
      return s;
    }
    function range(a, b) { var r = []; if (a <= b) for (var i = a; i <= b; i++) r.push(i); else for (var j = a; j >= b; j--) r.push(j); return r; }
    function statusSelect(v) {
      var s = h('select', { class: 'sel' }, [['before', '읽기 전'], ['reading', '읽는 중'], ['done', '완독'], ['paused', '잠시 멈춤']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
      s.value = v; return s;
    }
    function coverField() {
      var preview = h('div', { class: 'reg-cover' });
      if (item.cover) preview.appendChild(h('img', { src: item.cover, class: 'cover-img' }));
      else preview.appendChild(h('div', { class: 'cover-ph', text: '표지' }));
      var fileInp = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
      fileInp.addEventListener('change', function () {
        var f = fileInp.files[0]; if (!f) return;
        Photo.processFile(f).then(function (r) {
          coverBlob = r.blob; coverPhotoId = U.uuid();
          clear(preview); preview.appendChild(h('img', { src: r.dataUrl, class: 'cover-img' }));
          item.cover = '';
        });
      });
      return h('div', { class: 'f' }, [
        h('label', { text: '표지' }),
        h('div', { class: 'reg-cover-row' }, [preview, h('button', { class: 'btn ghost sm', onclick: function () { fileInp.click(); }, text: '표지 업로드' }), fileInp])
      ]);
    }

    var save = h('button', { class: 'btn primary wide', text: '서재에 저장', onclick: function () {
      var title = form.querySelectorAll('input')[0].value.trim();
      if (!title) { toast('제목을 입력하세요'); return; }
      var inputs = form.querySelectorAll('input');
      var sels = form.querySelectorAll('select');
      var year = sels[0].value, month = sels[1].value;
      var rsm = (year && month) ? (year + '-' + month) : (year && !month ? '' : '');
      var data = {
        title: title, author: inputs[1].value.trim(), publisher: inputs[2].value.trim(), isbn13: inputs[3].value.trim(),
        readStartMonth: (year && month) ? (year + '-' + month) : '',
        status: sels[2].value, source: source,
        yes24Id: item.yes24Id || '', yes24Link: item.link || '', coverUrl: item.cover || '',
        origTitle: item.title || '', origAuthor: item.author || '', origPublisher: item.publisher || ''
      };
      var done = function (book) {
        toast('저장했습니다'); go('book', { bookId: book.id });
      };
      if (coverBlob) {
        Photo.savePhoto(coverPhotoId, coverBlob).then(function () {
          data.coverPhotoId = coverPhotoId; data.coverUrl = '';
          return Store.newBook(data);
        }).then(done);
      } else { Store.newBook(data).then(done); }
    } });
    form.appendChild(save);

    if (inlineHost) { clear(inlineHost); inlineHost.appendChild(form); }
    else A.modal(form, { title: '책 등록', wide: true });
  }

  // =================== 책 노트 화면 ===================
  A.screens.book = function renderBook() {
    var id = A.state.bookId;
    DB.get('books', id).then(function (book) {
      if (!book || book.deleted) { toast('책을 찾을 수 없습니다'); go('library'); return; }
      Store.listBlocks(id).then(function (blocks) {
        drawBook(book, blocks);
      });
    });
  };

  function drawBook(book, blocks) {
    var view = document.getElementById('view'); clear(view);
    var page = h('div', { class: 'page book-page' });

    // ----- 헤더 -----
    var cover = h('div', { class: 'bk-cover' }); A.coverInto(cover, book);
    var statusSel = h('select', { class: 'sel sm' }, [['before', '읽기 전'], ['reading', '읽는 중'], ['done', '완독'], ['paused', '잠시 멈춤']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    statusSel.value = book.status;
    statusSel.addEventListener('change', function () { book.status = statusSel.value; Store.saveBook(book); toast('상태 변경'); });

    var head = h('div', { class: 'bk-head' }, [
      cover,
      h('div', { class: 'bk-info' }, [
        h('div', { class: 'bk-title', text: book.title || '제목 없음' }),
        h('div', { class: 'bk-author muted', text: book.author || '' }),
        book.publisher ? h('div', { class: 'muted small', text: book.publisher }) : null,
        h('div', { class: 'bk-metarow' }, [
          h('span', { class: 'muted small', text: U.startLabel(book.readStartMonth) }),
          statusSel
        ]),
        book.yes24Link ? h('a', { href: book.yes24Link, target: '_blank', rel: 'noopener', class: 'tiny link', text: 'YES24에서 보기' }) : null,
        h('div', { class: 'bk-actions' }, [
          h('button', { class: 'btn ghost sm', onclick: function () { editBookInfo(book); }, text: '정보 수정' }),
          h('button', { class: 'btn ghost sm', onclick: function () { Backup.exportBookMarkdown(book).then(function () { toast('Markdown 내보냄'); }); }, text: 'Markdown' }),
          h('button', { class: 'btn ghost sm danger', onclick: function () { A.confirmDialog('이 책을 휴지통으로 보낼까요? (문장·생각 함께)', true).then(function (ok) { if (ok) Store.deleteBook(book.id).then(function () { toast('휴지통으로 이동'); go('library'); }); }); }, text: '삭제' })
        ])
      ])
    ]);

    // ----- 블록 추가 바 -----
    var camInp = h('input', { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none' });
    var albumInp = h('input', { type: 'file', accept: 'image/*', multiple: true, style: 'display:none' });
    camInp.addEventListener('change', function () { addPhotos(book, camInp.files); camInp.value = ''; });
    albumInp.addEventListener('change', function () { addPhotos(book, albumInp.files); albumInp.value = ''; });

    // 심플한 흰색 블록 — + 를 누를 때만 기록 옵션이 나타남
    var addMenu = h('div', { class: 'add-menu' }, [
      h('button', { class: 'btn', onclick: function () { addManualBlock(book); } }, [h('span', { html: svg('pen') }), '직접 쓰기']),
      h('button', { class: 'btn primary', onclick: function () { camInp.click(); } }, [h('span', { html: svg('camera') }), '사진으로 기록']),
      h('button', { class: 'btn', onclick: function () { albumInp.click(); } }, [h('span', { html: svg('image') }), '앨범에서 추가'])
    ]);
    var addPlus = h('button', { class: 'add-plus', title: '기록 추가', html: svg('plus') });
    var addHead = h('div', { class: 'add-head' }, [addPlus, h('span', { class: 'muted small add-hint', text: '기록 추가' })]);
    var addbar = h('div', { class: 'add-card' }, [addHead, addMenu, camInp, albumInp]);
    addHead.addEventListener('click', function () { addbar.classList.toggle('open'); });

    // 정렬은 항상 최신 기록 먼저 (정렬 선택 UI 없음)
    var list = h('div', { class: 'block-list' });
    var sorted = sortBlocks(blocks, 'record');
    if (!sorted.length) list.appendChild(h('div', { class: 'empty small', text: '아직 문장 블록이 없어요. 위 버튼으로 추가하세요.' }));
    sorted.forEach(function (bl, idx) { list.appendChild(renderBlock(book, bl, sorted, idx)); });

    page.appendChild(h('div', { class: 'backbar' }, [h('button', { class: 'ico', onclick: function () { go('library'); }, html: svg('back') }), h('div', { class: 'bb-title', text: '내 서재로' }), h('div', { class: 'spacer' })]));
    page.appendChild(head); page.appendChild(addbar); page.appendChild(list);
    view.appendChild(page);

    if (A.state.jumpBlock) {
      var target = document.getElementById('block-' + A.state.jumpBlock);
      if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); target.classList.add('flash'); setTimeout(function () { target.classList.remove('flash'); }, 2000); }
      A.state.jumpBlock = null;
    }
  }

  function sortBlocks(blocks, mode) {
    var a = blocks.slice();
    if (mode === 'record') a.sort(function (x, y) { return (y.updatedAt || 0) - (x.updatedAt || 0); });
    else if (mode === 'page') a.sort(function (x, y) { return pageNum(x.page) - pageNum(y.page) || x.manualOrder - y.manualOrder; });
    else a.sort(function (x, y) { return x.manualOrder - y.manualOrder; });
    return a;
  }
  function pageNum(p) { var m = /\d+/.exec(String(p || '')); return m ? Number(m[0]) : 999999; }

  // ----- 사진으로 블록 추가 -----
  function addPhotos(book, fileList) {
    var files = Array.prototype.slice.call(fileList);
    if (!files.length) return;
    toast(files.length + '장 처리 중…');
    var baseOrder = U.now();
    var chain = Promise.resolve();
    files.forEach(function (f, i) {
      chain = chain.then(function () {
        return Photo.processFile(f).then(function (r) {
          var photoId = U.uuid();
          return Photo.savePhoto(photoId, r.blob).then(function () {
            var ocrStatus = CONFIG.isLoggedIn() ? (navigator.onLine ? 'pending' : 'waitingNet') : (CONFIG.hasBackend() ? 'waitingNet' : 'noBackend');
            return Store.newBlock(book.id, {
              type: 'photo', photoId: photoId, ocrStatus: ocrStatus,
              order: baseOrder + i, manualOrder: baseOrder + i // 선택 순서 유지
            });
          });
        });
      });
    });
    chain.then(function () {
      toast(files.length + '개 블록 생성됨' + (CONFIG.isLoggedIn() ? ' — OCR 처리 중' : ''));
      if (CONFIG.isLoggedIn() && navigator.onLine) Sync.flush();
      A.screens.book();
    });
  }
  function addManualBlock(book) {
    var baseOrder = U.now();
    Store.newBlock(book.id, { type: 'manual', ocrStatus: 'none', order: baseOrder, manualOrder: baseOrder }).then(function () { A.screens.book(); });
  }

  // ----- 블록 카드 -----
  function renderBlock(book, bl, siblings, idx) {
    var card = h('div', { class: 'block-card', id: 'block-' + bl.id });
    // 접기 상태
    var collapsed = bl._collapsed;

    // 상단 바: 페이지/제목/즐겨찾기/순서/접기/삭제
    var favBtn = h('button', { class: 'ico sm' + (bl.favorite ? ' fav-on' : ''), title: '즐겨찾기', html: svg('star'), onclick: function () { bl.favorite = !bl.favorite; Store.saveBlock(bl); favBtn.classList.toggle('fav-on', bl.favorite); } });
    var topbar = h('div', { class: 'blk-top' }, [
      h('div', { class: 'spacer' }),
      favBtn,
      h('button', { class: 'ico sm', title: collapsed ? '펼치기' : '접기', text: collapsed ? '▸' : '▾', onclick: function () { bl._collapsed = !collapsed; A.screens.book(); } }),
      h('button', { class: 'ico sm', title: '복사', html: svg('copy'), onclick: function () { navigator.clipboard && navigator.clipboard.writeText(U.htmlToText(bl.body)).then(function () { toast('복사됨'); }); } }),
      h('button', { class: 'ico sm danger', title: '삭제', html: svg('trash'), onclick: function () { A.confirmDialog('이 문장 블록을 휴지통으로? (내 생각 함께)', true).then(function (ok) { if (ok) Store.deleteBlock(bl.id).then(function () { toast('휴지통으로'); A.screens.book(); }); }); } })
    ]);
    card.appendChild(topbar);
    if (collapsed) {
      card.appendChild(h('div', { class: 'blk-collapsed muted', text: (U.htmlToText(bl.body) || '(빈 블록)').slice(0, 60) }));
      return card;
    }

    // 사진 썸네일 (접기/확대)
    if (bl.type === 'photo' && bl.photoId) {
      var thumbWrap = h('div', { class: 'blk-photo' });
      Photo.photoObjectUrl(bl.photoId).then(function (url) {
        if (!url) { thumbWrap.appendChild(h('span', { class: 'muted tiny', text: '사진 불러오는 중…' })); return; }
        var img = h('img', { src: url, class: 'thumb', onclick: function () { zoomPhoto(url); } });
        thumbWrap.appendChild(img);
      });
      card.appendChild(h('details', { class: 'blk-photo-det' }, [h('summary', { text: '원본 사진' }), thumbWrap]));
    }

    // OCR 상태
    card.appendChild(ocrBar(bl));

    // 본문 에디터
    var bodyEl = h('div', { class: 'editor body-editor', 'data-ph': '문장을 입력하세요' });
    bodyEl.innerHTML = bl.body || '';
    var ed = Editor.attach(bodyEl, { placeholder: '문장을 입력하세요', onSave: function (html) { bl.body = html; Store.saveBlock(bl); } });
    A.editors['blk-' + bl.id] = ed;

    // 페이지: 포맷바(목록) 옆에 작게 표시
    var pageInp = h('input', { class: 'inp page-inline', placeholder: '쪽', value: bl.page || '', title: '페이지' });
    pageInp.addEventListener('blur', function () { bl.page = pageInp.value; Store.saveBlock(bl); });
    // 서식 버튼 없이 기본 글씨체로 작성만 — 페이지(쪽)만 오른쪽에
    var toolbar = h('div', { class: 'fmt-bar' }, [
      h('span', { class: 'spacer' }), pageInp
    ]);

    card.appendChild(toolbar);
    card.appendChild(bodyEl);

    // ----- 내 생각 하위 블록 -----
    var thoughtsWrap = h('div', { class: 'thoughts' });
    card.appendChild(thoughtsWrap);
    Store.listThoughts(bl.id).then(function (ths) {
      ths.sort(function (a, b) { return a.order - b.order; });
      renderThoughts(book, bl, ths, thoughtsWrap);
    });
    card.appendChild(h('button', { class: 'btn ghost sm add-thought', onclick: function () {
      Store.newThought(bl, { order: U.now() }).then(function () { A.screens.book(); setTimeout(function () { var t = document.getElementById('block-' + bl.id); if (t) t.scrollIntoView({ block: 'center' }); }, 60); });
    } }, ['+ 내 생각 추가']));

    // 오른쪽 하단: 최종 기록일 (자동, 표시만)
    card.appendChild(h('div', { class: 'blk-foot' }, [h('span', { class: 'tiny muted', text: '최종 기록 ' + U.dateLabel(bl.updatedAt) })]));
    return card;
  }

  function ocrBar(bl) {
    var map = {
      pending: ['OCR 대기 중', 'pending'], processing: ['OCR 처리 중…', 'pending'],
      waitingNet: ['연결 후 인식 대기', 'wait'], done: ['OCR 완료', 'done'],
      failed: ['OCR 실패', 'fail'], noBackend: ['OCR은 서버 연결 후 가능 — 직접 입력', 'wait'], none: ['', '']
    };
    var m = map[bl.ocrStatus] || ['', ''];
    if (!m[0] && !bl.ocrCandidate) return h('span');
    var bar = h('div', { class: 'ocr-bar ' + m[1] }, [h('span', { class: 'tiny', text: m[0] })]);
    if ((bl.ocrStatus === 'failed' || bl.ocrStatus === 'waitingNet') && CONFIG.isLoggedIn()) {
      bar.appendChild(h('button', { class: 'tiny link', text: '재시도', onclick: function () { bl.ocrStatus = 'waitingNet'; bl.photoFileId = ''; Store.saveBlock(bl).then(function () { Sync.flush(); toast('재시도 대기'); A.screens.book(); }); } }));
    }
    if (bl.ocrStatus === 'done' && bl.photoFileId && CONFIG.isLoggedIn()) {
      bar.appendChild(h('button', { class: 'tiny link', text: '재인식', onclick: function () { reOcr(bl); } }));
    }
    // 재인식 결과 비교 적용
    if (bl.ocrCandidate) {
      bar.appendChild(h('button', { class: 'tiny link warn', text: '새 인식결과 보기', onclick: function () { showOcrCompare(bl); } }));
    }
    return bar;
  }
  function reOcr(bl) {
    if (!bl.photoFileId) { toast('서버 사진이 없습니다'); return; }
    toast('재인식 중…');
    API.ocr(bl.photoFileId).then(function (oc) {
      if (oc && oc.ok) { bl.ocrCandidate = oc.text || ''; Store.saveBlock(bl).then(function () { A.screens.book(); }); toast('새 인식결과 준비됨'); }
      else toast('재인식 실패');
    }).catch(function () { toast('재인식 오류'); });
  }
  function showOcrCompare(bl) {
    var m = A.modal(h('div', { class: 'ocr-compare' }, [
      h('p', { class: 'muted small', text: '새 인식 결과입니다. 적용하면 현재 본문을 대체합니다 (적용은 직접 선택).' }),
      h('div', { class: 'ocr-cols' }, [
        h('div', { class: 'ocr-col' }, [h('h4', { text: '현재 본문' }), h('div', { class: 'ocr-text', text: U.htmlToText(bl.body) || '(비어 있음)' })]),
        h('div', { class: 'ocr-col' }, [h('h4', { text: '새 인식 결과' }), h('div', { class: 'ocr-text', text: bl.ocrCandidate })])
      ]),
      h('div', { class: 'modal-btns' }, [
        h('button', { class: 'btn ghost', onclick: function () { m.close(); }, text: '그대로 두기' }),
        h('button', { class: 'btn primary', onclick: function () { bl.body = U.escapeHtml(bl.ocrCandidate).replace(/\n/g, '<br>'); bl.ocrCandidate = ''; Store.saveBlock(bl).then(function () { m.close(); A.screens.book(); }); }, text: '새 결과 적용' })
      ])
    ]), { title: '재인식 결과 비교', wide: true });
  }

  function tagEditor(bl) {
    var wrap = h('div', { class: 'tag-wrap' });
    function redraw() {
      clear(wrap);
      (bl.tags || []).forEach(function (t, i) {
        wrap.appendChild(h('span', { class: 'tag' }, [t, h('button', { class: 'tag-x', text: '×', onclick: function () { bl.tags.splice(i, 1); Store.saveBlock(bl); redraw(); } })]));
      });
      var inp = h('input', { class: 'tag-inp', placeholder: '+태그' });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); var v = inp.value.trim().replace(/,$/, ''); if (v) { bl.tags = bl.tags || []; if (bl.tags.indexOf(v) < 0) bl.tags.push(v); Store.saveBlock(bl); redraw(); } }
      });
      wrap.appendChild(inp);
    }
    redraw(); return wrap;
  }

  function renderThoughts(book, bl, ths, wrap) {
    clear(wrap);
    if (!ths.length) return;
    ths.forEach(function (th, i) {
      var tEl = h('div', { class: 'thought-editor editor', 'data-ph': '내 생각…' });
      tEl.innerHTML = th.body || '';
      var ed = Editor.attach(tEl, { placeholder: '내 생각…', onSave: function (html) { th.body = html; Store.saveThought(th); } });
      A.editors['th-' + th.id] = ed;
      wrap.appendChild(h('div', { class: 'thought' }, [
        h('div', { class: 'th-top' }, [
          h('div', { class: 'spacer' }),
          h('button', { class: 'ico xs', title: '위로', html: svg('up'), disabled: i === 0, onclick: function () { moveThought(bl, ths, i, -1); } }),
          h('button', { class: 'ico xs', title: '아래로', html: svg('down'), disabled: i === ths.length - 1, onclick: function () { moveThought(bl, ths, i, 1); } }),
          h('button', { class: 'ico xs danger', title: '삭제', html: svg('trash'), onclick: function () { A.confirmDialog('이 생각을 휴지통으로?', true).then(function (ok) { if (ok) Store.deleteThought(th.id).then(function () { A.screens.book(); }); }); } })
        ]),
        tEl
      ]));
    });
  }

  function moveBlock(siblings, idx, dir) {
    var j = idx + dir; if (j < 0 || j >= siblings.length) return;
    var a = siblings[idx], b = siblings[j];
    var tmp = a.manualOrder; a.manualOrder = b.manualOrder; b.manualOrder = tmp;
    if (A.state.bookSort !== 'manual') A.state.bookSort = 'manual';
    Promise.all([Store.saveBlock(a), Store.saveBlock(b)]).then(function () { A.screens.book(); });
  }
  function moveThought(bl, ths, idx, dir) {
    var j = idx + dir; if (j < 0 || j >= ths.length) return;
    var a = ths[idx], b = ths[j];
    var tmp = a.order; a.order = b.order; b.order = tmp;
    Promise.all([Store.saveThought(a), Store.saveThought(b)]).then(function () { A.screens.book(); });
  }

  function editBookInfo(book) {
    var inpT = h('input', { class: 'inp', value: book.title || '' });
    var inpA = h('input', { class: 'inp', value: book.author || '' });
    var inpP = h('input', { class: 'inp', value: book.publisher || '' });
    var now = new Date().getFullYear();
    var ysel = h('select', { class: 'sel' }, [h('option', { value: '', text: '미정' })].concat(rangeDown(now + 1, now - 30).map(function (y) { return h('option', { value: String(y), text: y + '년' }); })));
    var msel = h('select', { class: 'sel' }, [h('option', { value: '', text: '미정' })].concat(rangeUp(1, 12).map(function (m) { return h('option', { value: (m < 10 ? '0' : '') + m, text: m + '월' }); })));
    if (book.readStartMonth) { var t = book.readStartMonth.split('-'); ysel.value = t[0]; msel.value = t[1]; }
    var fin = h('input', { type: 'date', class: 'inp', value: book.finishedDate ? U.toDateInput(book.finishedDate) : '' });
    function rangeUp(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
    function rangeDown(a, b) { var r = []; for (var i = a; i >= b; i--) r.push(i); return r; }
    var form = h('div', { class: 'reg-form' }, [
      h('div', { class: 'f' }, [h('label', { text: '제목' }), inpT]),
      h('div', { class: 'f' }, [h('label', { text: '저자' }), inpA]),
      h('div', { class: 'f' }, [h('label', { text: '출판사' }), inpP]),
      h('div', { class: 'f-row' }, [h('div', { class: 'f' }, [h('label', { text: '독서 시작 연도' }), ysel]), h('div', { class: 'f' }, [h('label', { text: '월' }), msel])]),
      h('div', { class: 'f' }, [h('label', { text: '완독한 날짜 (선택)' }), fin]),
      book.origTitle && book.source === 'yes24' ? h('p', { class: 'muted tiny', text: 'YES24 원본: ' + book.origTitle + (book.origAuthor ? ' / ' + book.origAuthor : '') + ' (수정해도 원본은 보관됩니다)' }) : null,
      h('button', { class: 'btn primary wide', text: '저장', onclick: function () {
        book.title = inpT.value.trim(); book.author = inpA.value.trim(); book.publisher = inpP.value.trim();
        book.readStartMonth = (ysel.value && msel.value) ? (ysel.value + '-' + msel.value) : '';
        book.finishedDate = fin.value ? U.fromDateInput(fin.value) : null;
        Store.saveBook(book).then(function () { m.close(); toast('저장됨'); A.screens.book(); });
      } })
    ]);
    var m = A.modal(form, { title: '책 정보 수정', wide: true });
  }

  function zoomPhoto(url) {
    var ov = h('div', { class: 'zoom-ov', onclick: function () { ov.remove(); } }, [h('img', { src: url, class: 'zoom-img' })]);
    document.body.appendChild(ov);
  }

  // =================== 전체 검색 ===================
  A.screens.search = function renderSearch() {
    var view = document.getElementById('view'); clear(view);
    var input = h('input', { class: 'inp', placeholder: '제목·저자·문장·내 생각·태그 검색', autofocus: true });
    var results = h('div', { class: 'search-results' });
    var page = h('div', { class: 'page' }, [
      backBar('전체 검색'),
      h('div', { class: 'search-box' }, [input]),
      results
    ]);
    view.appendChild(page);
    setTimeout(function () { input.focus(); }, 50);
    var run = U.debounce(function () {
      var q = input.value.trim().toLowerCase();
      clear(results);
      if (!q) return;
      Promise.all([Store.listBooks(), DB.all('blocks'), DB.all('thoughts')]).then(function (r) {
        var books = r[0], blocks = r[1].filter(function (b) { return !b.deleted; }), thoughts = r[2].filter(function (b) { return !b.deleted; });
        var bookMap = {}; books.forEach(function (b) { bookMap[b.id] = b; });
        var hits = [];
        books.forEach(function (b) {
          if ((b.title || '').toLowerCase().indexOf(q) >= 0 || (b.author || '').toLowerCase().indexOf(q) >= 0)
            hits.push({ type: '책', book: b, text: b.title + (b.author ? ' · ' + b.author : '') });
        });
        blocks.forEach(function (bl) {
          var txt = U.htmlToText(bl.body).toLowerCase();
          var tags = (bl.tags || []).join(' ').toLowerCase();
          if (txt.indexOf(q) >= 0 || tags.indexOf(q) >= 0 || (bl.blockTitle || '').toLowerCase().indexOf(q) >= 0) {
            if (bookMap[bl.bookId]) hits.push({ type: '문장', book: bookMap[bl.bookId], blockId: bl.id, text: (bl.blockTitle ? '[' + bl.blockTitle + '] ' : '') + (U.htmlToText(bl.body) || tags).slice(0, 80) });
          }
        });
        thoughts.forEach(function (th) {
          var txt = U.htmlToText(th.body).toLowerCase();
          if (txt.indexOf(q) >= 0 && bookMap[th.bookId]) hits.push({ type: '생각', book: bookMap[th.bookId], blockId: th.blockId, text: U.htmlToText(th.body).slice(0, 80) });
        });
        if (!hits.length) { results.appendChild(h('div', { class: 'muted', text: '결과 없음' })); return; }
        hits.forEach(function (hit) {
          results.appendChild(h('button', { class: 'hit', onclick: function () { go('book', { bookId: hit.book.id, jumpBlock: hit.blockId || null }); } }, [
            h('span', { class: 'hit-type', text: hit.type }),
            h('span', { class: 'hit-book', text: hit.book.title }),
            h('span', { class: 'hit-text muted', text: hit.text })
          ]));
        });
      });
    }, 200);
    input.addEventListener('input', run);
  };

  // =================== 설정 / 백업 / 휴지통 ===================
  A.screens.settings = function renderSettings() {
    var view = document.getElementById('view'); clear(view);
    var urlInp = h('input', { class: 'inp', placeholder: 'https://script.google.com/.../exec', value: CONFIG.get('webAppUrl') || '' });
    var counts = h('div', { class: 'muted small' });
    Promise.all([DB.all('books'), DB.all('blocks'), DB.all('thoughts'), DB.all('photos')]).then(function (r) {
      counts.textContent = '책 ' + r[0].filter(nd).length + ' · 블록 ' + r[1].filter(nd).length + ' · 생각 ' + r[2].filter(nd).length + ' · 사진 ' + r[3].length;
    });
    function nd(x) { return !x.deleted; }

    var importInp = h('input', { type: 'file', accept: '.zip', style: 'display:none' });
    importInp.addEventListener('change', function () { var f = importInp.files[0]; if (!f) return; toast('가져오는 중…'); Backup.importZip(f).then(function () { toast('가져오기 완료'); importInp.value = ''; }).catch(function (e) { toast('가져오기 실패: ' + e.message, 'err'); }); });

    var loginBox;
    if (!CONFIG.hasBackend()) {
      loginBox = h('p', { class: 'muted small', text: '웹앱 주소를 입력하고 저장하면 로그인·동기화가 켜집니다.' });
    } else if (!CONFIG.isLoggedIn()) {
      var pw = h('input', { type: 'password', class: 'inp', placeholder: '비밀번호' });
      loginBox = h('div', { class: 'f-row' }, [pw, h('button', { class: 'btn primary', text: '로그인', onclick: function () { API.login(pw.value).then(function () { toast('로그인됨'); Sync.initialSync(); A.screens.settings(); A.refreshBadge(); }).catch(function (e) { toast('실패: ' + (e.message === 'bad-pw' ? '비밀번호 오류' : e.message), 'err'); }); } })]);
    } else {
      loginBox = h('div', { class: 'row-between' }, [h('span', { class: 'ok', text: '✓ 로그인됨 · 동기화 활성' }), h('button', { class: 'btn ghost sm', text: '로그아웃', onclick: function () { API.logout().then(function () { A.screens.settings(); A.refreshBadge(); }); } })]);
    }

    var page = h('div', { class: 'page settings' }, [
      backBar('설정'),
      section('저장 서버 (백엔드)', [
        h('label', { class: 'lbl', text: 'Apps Script 웹앱 주소' }),
        urlInp,
        h('div', { class: 'f-row' }, [
          h('button', { class: 'btn primary', text: '주소 저장', onclick: function () { CONFIG.set('webAppUrl', urlInp.value.trim()); toast('저장됨'); A.screens.settings(); A.refreshBadge(); } }),
          h('button', { class: 'btn ghost', text: '연결 확인', onclick: function () { if (!urlInp.value.trim()) { toast('주소를 입력하세요'); return; } CONFIG.set('webAppUrl', urlInp.value.trim()); API.ping().then(function (r) { toast(r && r.ok ? '서버 응답 정상' : '응답 이상'); }).catch(function (e) { toast('연결 실패: ' + e.message, 'err'); }); } })
        ]),
        loginBox
      ]),
      section('백업', [
        h('p', { class: 'muted small', text: '책·블록·생각·순서·원본 사진을 JSON+이미지 ZIP으로 내보내고 다시 가져올 수 있습니다.' }),
        h('div', { class: 'f-row' }, [
          h('button', { class: 'btn primary', text: '전체 백업 내보내기', onclick: function () { toast('내보내는 중…'); Backup.exportAll().then(function () { toast('내보냄'); }).catch(function (e) { toast('실패: ' + e.message, 'err'); }); } }),
          h('button', { class: 'btn ghost', text: '백업 가져오기', onclick: function () { importInp.click(); } }),
          importInp
        ])
      ]),
      section('데이터', [
        counts,
        h('div', { class: 'f-row' }, [
          h('button', { class: 'btn ghost', text: '휴지통', onclick: function () { go('trash'); } }),
          h('button', { class: 'btn ghost danger', text: '이 기기 로컬 초기화', onclick: function () { A.confirmDialog('이 기기의 로컬 데이터를 모두 지웁니다. (서버 데이터는 유지, 백업 권장) 진행할까요?', true).then(function (ok) { if (ok) resetLocal(); }); } })
        ])
      ]),
      section('앱 정보', [
        h('p', { class: 'muted small', text: 'pharmarom tesoro — 책 속의 문장, 나의 생각' }),
        h('p', { class: 'muted tiny', text: '홈 화면에 추가하면 앱처럼 쓸 수 있습니다. (브라우저 메뉴 → 홈 화면에 추가)' })
      ])
    ]);
    view.appendChild(page);
  };
  function section(title, children) { return h('section', { class: 'sec' }, [h('h3', { text: title })].concat(children)); }
  function resetLocal() {
    indexedDB.deleteDatabase('tesoro-note');
    CONFIG.set('lastSync', 0);
    setTimeout(function () { location.reload(); }, 400);
  }

  A.screens.trash = function renderTrash() {
    var view = document.getElementById('view'); clear(view);
    Store.trash().then(function (t) {
      var list = h('div', { class: 'trash-list' });
      function row(label, sub, onRestore, onPurge) {
        return h('div', { class: 'trash-row' }, [
          h('div', { class: 'tr-info' }, [h('div', { text: label }), sub ? h('div', { class: 'muted tiny', text: sub }) : null]),
          h('button', { class: 'btn ghost sm', text: '복구', onclick: onRestore }),
          h('button', { class: 'btn danger sm', text: '영구삭제', onclick: onPurge })
        ]);
      }
      if (!t.books.length && !t.blocks.length && !t.thoughts.length) list.appendChild(h('div', { class: 'empty small', text: '휴지통이 비어 있습니다.' }));
      t.books.forEach(function (b) {
        list.appendChild(row('📕 ' + (b.title || '제목없음'), '책', function () { Store.restoreBook(b.id).then(function () { toast('복구됨'); A.screens.trash(); }); }, function () { A.confirmDialog('책을 영구 삭제합니다. 되돌릴 수 없습니다.', true).then(function (ok) { if (ok) purgeBook(b).then(function () { A.screens.trash(); }); }); }));
      });
      t.blocks.forEach(function (bl) {
        list.appendChild(row('📄 ' + (U.htmlToText(bl.body) || '빈 블록').slice(0, 40), '문장 블록', function () { Store.restoreBlock(bl.id).then(function () { toast('복구됨'); A.screens.trash(); }); }, function () { A.confirmDialog('블록을 영구 삭제합니다.', true).then(function (ok) { if (ok) Store.purge('block', bl.id).then(function () { A.screens.trash(); }); }); }));
      });
      t.thoughts.forEach(function (th) {
        list.appendChild(row('💭 ' + (U.htmlToText(th.body) || '빈 생각').slice(0, 40), '내 생각', function () { Store.restoreThought(th.id).then(function () { toast('복구됨'); A.screens.trash(); }); }, function () { A.confirmDialog('생각을 영구 삭제합니다.', true).then(function (ok) { if (ok) Store.purge('thought', th.id).then(function () { A.screens.trash(); }); }); }));
      });
      var page = h('div', { class: 'page' }, [backBar('휴지통'), list]);
      view.appendChild(page);
    });
  };
  function purgeBook(b) {
    return Promise.all([DB.byIndex('blocks', 'bookId', b.id), DB.byIndex('thoughts', 'bookId', b.id)]).then(function (r) {
      var chain = Promise.resolve();
      r[1].forEach(function (th) { chain = chain.then(function () { return Store.purge('thought', th.id); }); });
      r[0].forEach(function (bl) { chain = chain.then(function () { return Store.purge('block', bl.id); }); });
      return chain.then(function () { return Store.purge('book', b.id); });
    });
  }

  // =================== 충돌 해결 ===================
  A.showConflicts = function () {
    var cs = Sync.getConflicts();
    if (!cs.length) { toast('충돌 없음'); return; }
    var wrap = h('div', { class: 'conflict-list' });
    cs.forEach(function (c) {
      var localTxt = summarize(c.kind, c.local), serverTxt = summarize(c.kind, c.server);
      wrap.appendChild(h('div', { class: 'conflict' }, [
        h('div', { class: 'cf-kind tiny muted', text: kindLabel(c.kind) }),
        h('div', { class: 'ocr-cols' }, [
          h('div', { class: 'ocr-col' }, [h('h4', { text: '이 기기 수정본' }), h('div', { class: 'ocr-text', text: localTxt })]),
          h('div', { class: 'ocr-col' }, [h('h4', { text: '다른 기기 수정본' }), h('div', { class: 'ocr-text', text: serverTxt })])
        ]),
        h('div', { class: 'modal-btns' }, [
          h('button', { class: 'btn ghost', text: '이 기기 것 유지', onclick: function () { Sync.resolveConflict(c.kind, c.id, 'local').then(function () { m.close(); A.refreshBadge(); toast('이 기기 수정본 유지'); }); } }),
          h('button', { class: 'btn primary', text: '다른 기기 것 적용', onclick: function () { Sync.resolveConflict(c.kind, c.id, 'server').then(function () { m.close(); A.refreshBadge(); toast('다른 기기 수정본 적용'); }); } })
        ])
      ]));
    });
    var m = A.modal(h('div', {}, [h('p', { class: 'muted small', text: '두 기기에서 같은 항목을 수정했습니다. 어느 쪽을 둘지 선택하세요. (선택 전까지 양쪽 모두 보존됩니다.)' }), wrap]), { title: '동시 수정 충돌', wide: true });
  };
  function summarize(kind, o) {
    if (!o) return '(없음)';
    if (kind === 'book') return (o.title || '') + (o.author ? ' / ' + o.author : '');
    return U.htmlToText(o.body) || '(빈 내용)';
  }
  function kindLabel(k) { return k === 'book' ? '책' : k === 'block' ? '문장 블록' : '내 생각'; }

})();
