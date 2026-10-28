/* pharmarom tesoro — 리치텍스트 편집기 (한글 IME 안전, 자동저장, 실행취소) */
window.Editor = (function () {
  'use strict';

  // el: contentEditable div, opts: { onSave(html), placeholder }
  // 반환: { destroy(), focus(), getHtml(), setHtml(html, force) }
  function attach(el, opts) {
    opts = opts || {};
    var composing = false;
    var undoStack = [], redoStack = [];
    var lastSnapshot = el.innerHTML;

    el.setAttribute('contenteditable', 'true');
    el.setAttribute('role', 'textbox');
    el.setAttribute('aria-multiline', 'true');
    if (opts.placeholder) el.setAttribute('data-ph', opts.placeholder);
    refreshEmpty();

    function refreshEmpty() {
      var txt = (el.textContent || '').trim();
      el.classList.toggle('is-empty', txt === '' && !/<(img|br|li)/i.test(el.innerHTML));
    }

    var save = U.debounce(function () {
      if (composing) return; // 한글 조합 중에는 저장/재렌더 금지
      var html = U.sanitizeHtml(el.innerHTML);
      if (opts.onSave) opts.onSave(html);
    }, 600);

    function snapshot() {
      // 조합 중이 아닐 때만 스냅샷
      if (composing) return;
      var cur = el.innerHTML;
      if (cur !== lastSnapshot) {
        undoStack.push(lastSnapshot);
        if (undoStack.length > 50) undoStack.shift();
        redoStack = [];
        lastSnapshot = cur;
      }
    }
    var snapDebounced = U.debounce(snapshot, 500);

    function onInput() {
      refreshEmpty();
      if (composing) return;
      snapDebounced();
      save();
    }
    function onCompositionStart() { composing = true; }
    function onCompositionEnd() {
      composing = false;
      // 조합이 끝난 뒤에만 처리 — 글자 끊김/커서 튐 방지
      refreshEmpty();
      snapDebounced();
      save();
    }
    function onKeydown(e) {
      // 자체 실행취소 (조합 중 제외)
      if ((e.ctrlKey || e.metaKey) && !composing) {
        var k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); return; }
        if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); doRedo(); return; }
      }
    }
    function doUndo() {
      if (!undoStack.length) return;
      redoStack.push(el.innerHTML);
      var prev = undoStack.pop();
      el.innerHTML = prev; lastSnapshot = prev;
      placeCaretEnd(); refreshEmpty(); save();
    }
    function doRedo() {
      if (!redoStack.length) return;
      undoStack.push(el.innerHTML);
      var nxt = redoStack.pop();
      el.innerHTML = nxt; lastSnapshot = nxt;
      placeCaretEnd(); refreshEmpty(); save();
    }

    el.addEventListener('input', onInput);
    el.addEventListener('compositionstart', onCompositionStart);
    el.addEventListener('compositionend', onCompositionEnd);
    el.addEventListener('keydown', onKeydown);
    el.addEventListener('blur', function () { if (!composing) { var html = U.sanitizeHtml(el.innerHTML); if (opts.onSave) opts.onSave(html); } });

    function placeCaretEnd() {
      try {
        el.focus();
        var r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
        var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      } catch (e) {}
    }

    return {
      el: el,
      destroy: function () {
        el.removeEventListener('input', onInput);
        el.removeEventListener('compositionstart', onCompositionStart);
        el.removeEventListener('compositionend', onCompositionEnd);
        el.removeEventListener('keydown', onKeydown);
      },
      focus: function () { el.focus(); },
      getHtml: function () { return U.sanitizeHtml(el.innerHTML); },
      setHtml: function (html, force) {
        // 조합 중에는 강제 아니면 재설정 금지
        if (composing && !force) return;
        el.innerHTML = html || ''; lastSnapshot = el.innerHTML; refreshEmpty();
      },
      undo: doUndo, redo: doRedo
    };
  }

  // 서식 명령 (버튼에서 호출) — 현재 포커스된 editable에 적용
  function cmd(name) {
    try {
      if (name === 'highlight') {
        document.execCommand('hiliteColor', false, '#fff3b0') ||
          document.execCommand('backColor', false, '#fff3b0');
      } else if (name === 'bold') document.execCommand('bold', false, null);
      else if (name === 'italic') document.execCommand('italic', false, null);
      else if (name === 'ul') document.execCommand('insertUnorderedList', false, null);
      else if (name === 'clear') document.execCommand('removeFormat', false, null);
    } catch (e) {}
  }

  return { attach: attach, cmd: cmd };
})();
