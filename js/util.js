/* pharmarom tesoro — 공용 유틸리티 */
window.U = (function () {
  'use strict';

  // 고유 ID (클라이언트 생성 — 멱등키로 사용)
  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function now() { return Date.now(); }

  // "2026-10" → "2026년 10월", "" → "시작 월 미정"
  function monthLabel(m) {
    if (!m) return '시작 월 미정';
    var t = /^(\d{4})-(\d{2})$/.exec(String(m).trim());
    if (!t) return String(m);
    return t[1] + '년 ' + Number(t[2]) + '월';
  }
  // "2026-10" → "2026년 10월 시작"
  function startLabel(m) {
    return m ? monthLabel(m) + ' 시작' : '시작 월 미정';
  }

  // Date|number → "2026.10.27"
  function dateLabel(v) {
    if (!v) return '';
    var d = (v instanceof Date) ? v : new Date(v);
    if (isNaN(d.getTime())) return String(v);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate());
  }
  // Date|number → "2026.10.27 14:30"
  function dateTimeLabel(v) {
    if (!v) return '';
    var d = (v instanceof Date) ? v : new Date(v);
    if (isNaN(d.getTime())) return String(v);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  // number(ms) → "YYYY-MM-DD" (date input 용)
  function toDateInput(v) {
    var d = v ? new Date(v) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  // "YYYY-MM-DD" → ms (로컬 자정)
  function fromDateInput(s) {
    if (!s) return null;
    var t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!t) return null;
    return new Date(Number(t[1]), Number(t[2]) - 1, Number(t[3])).getTime();
  }
  // 현재 연-월 "YYYY-MM"
  function curMonth() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 리치텍스트 저장용 sanitize — 허용 태그/속성만 남김
  var ALLOWED = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, MARK: 1, BR: 1, DIV: 1, P: 1, UL: 1, OL: 1, LI: 1, SPAN: 1 };
  function sanitizeHtml(html) {
    var tpl = document.createElement('div');
    tpl.innerHTML = String(html || '');
    (function walk(node) {
      var child = node.firstChild;
      while (child) {
        var next = child.nextSibling;
        if (child.nodeType === 1) {
          if (!ALLOWED[child.tagName]) {
            // 허용 안 된 태그는 내용만 남기고 태그 제거
            while (child.firstChild) node.insertBefore(child.firstChild, child);
            node.removeChild(child);
          } else {
            // 속성 제거 (형광펜 span의 배경만 허용)
            var keepStyle = '';
            if (child.tagName === 'SPAN' || child.tagName === 'MARK') {
              var bg = child.style && child.style.backgroundColor;
              if (bg) keepStyle = 'background-color:' + bg;
            }
            for (var i = child.attributes.length - 1; i >= 0; i--) child.removeAttribute(child.attributes[i].name);
            if (keepStyle) child.setAttribute('style', keepStyle);
            walk(child);
          }
        } else if (child.nodeType === 8) {
          node.removeChild(child); // 주석 제거
        }
        child = next;
      }
    })(tpl);
    return tpl.innerHTML;
  }

  // HTML → 순수 텍스트 (검색/Markdown 용)
  function htmlToText(html) {
    var d = document.createElement('div');
    d.innerHTML = String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n');
    return (d.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }

  // 간단 Markdown 변환 (목록/굵게 정도만)
  function htmlToMarkdown(html) {
    var s = String(html || '');
    s = s.replace(/<(strong|b)>/gi, '**').replace(/<\/(strong|b)>/gi, '**');
    s = s.replace(/<(em|i)>/gi, '*').replace(/<\/(em|i)>/gi, '*');
    s = s.replace(/<li>/gi, '- ').replace(/<\/li>/gi, '\n');
    s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div)>/gi, '\n');
    return htmlToText(s);
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  }

  // 배열 정렬키 사이 삽입용 order 값
  function midOrder(a, b) {
    if (a == null && b == null) return 1000;
    if (a == null) return b - 1;
    if (b == null) return a + 1;
    return (a + b) / 2;
  }

  var statusLabels = { before: '읽기 전', reading: '읽는 중', done: '완독', paused: '잠시 멈춤' };

  return {
    uuid: uuid, now: now, monthLabel: monthLabel, startLabel: startLabel,
    dateLabel: dateLabel, dateTimeLabel: dateTimeLabel, toDateInput: toDateInput,
    fromDateInput: fromDateInput, curMonth: curMonth, escapeHtml: escapeHtml,
    sanitizeHtml: sanitizeHtml, htmlToText: htmlToText, htmlToMarkdown: htmlToMarkdown,
    debounce: debounce, midOrder: midOrder, statusLabels: statusLabels
  };
})();
