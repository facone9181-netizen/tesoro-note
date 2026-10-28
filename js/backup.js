/* pharmarom tesoro — 백업 내보내기/가져오기 (JSON+이미지 ZIP), 책별 Markdown */
window.Backup = (function () {
  'use strict';

  function download(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // 전체 백업: data.json + images/<photoId>.jpg
  function exportAll() {
    if (!window.JSZip) return Promise.reject(new Error('JSZip 미로딩'));
    var zip = new JSZip();
    return Promise.all([DB.all('books'), DB.all('blocks'), DB.all('thoughts'), DB.all('photos')])
      .then(function (r) {
        var data = {
          app: 'pharmarom-tesoro', version: 1, exportedAt: U.now(),
          books: r[0], blocks: r[1], thoughts: r[2],
          photos: r[3].map(function (p) { return { id: p.id, at: p.at }; })
        };
        zip.file('data.json', JSON.stringify(data, null, 2));
        var img = zip.folder('images');
        r[3].forEach(function (p) { if (p.blob) img.file(p.id + '.jpg', p.blob); });
        return zip.generateAsync({ type: 'blob' });
      }).then(function (blob) {
        download(blob, 'tesoro-백업-' + U.toDateInput(U.now()) + '.zip');
      });
  }

  // 가져오기: upsert (같은 id는 최신 version 유지)
  function importZip(file) {
    if (!window.JSZip) return Promise.reject(new Error('JSZip 미로딩'));
    return JSZip.loadAsync(file).then(function (zip) {
      var dj = zip.file('data.json');
      if (!dj) throw new Error('data.json 없음');
      return dj.async('string').then(function (txt) {
        var data = JSON.parse(txt);
        var chain = Promise.resolve();
        var imgFolder = zip.folder('images');
        function upsert(store, rows) {
          (rows || []).forEach(function (row) {
            chain = chain.then(function () {
              return DB.get(store, row.id).then(function (ex) {
                if (!ex || (row.version || 0) >= (ex.version || 0)) {
                  row.dirty = true; return DB.put(store, row).then(function () { return DB.enqueue({ kind: kindOf(store), id: row.id, at: U.now() }); });
                }
              });
            });
          });
        }
        function kindOf(s) { return s === 'books' ? 'book' : s === 'blocks' ? 'block' : 'thought'; }
        upsert('books', data.books); upsert('blocks', data.blocks); upsert('thoughts', data.thoughts);
        // 이미지 복원
        (data.photos || []).forEach(function (p) {
          chain = chain.then(function () {
            var f = zip.file('images/' + p.id + '.jpg');
            if (!f) return;
            return f.async('blob').then(function (blob) { return DB.put('photos', { id: p.id, blob: blob, at: p.at || U.now() }); });
          });
        });
        return chain;
      });
    });
  }

  // 책별 Markdown 내보내기 (읽기용)
  function exportBookMarkdown(book) {
    return Store.listBlocks(book.id).then(function (blocks) {
      blocks.sort(function (a, b) { return a.order - b.order; });
      var lines = ['# ' + (book.title || '제목 없음'), ''];
      if (book.author) lines.push('- 저자: ' + book.author);
      if (book.publisher) lines.push('- 출판사: ' + book.publisher);
      if (book.readStartMonth) lines.push('- ' + U.startLabel(book.readStartMonth));
      lines.push('- 상태: ' + (U.statusLabels[book.status] || book.status));
      lines.push(''); lines.push('---'); lines.push('');
      var chain = Promise.resolve();
      blocks.forEach(function (bl) {
        chain = chain.then(function () {
          if (bl.blockTitle) lines.push('## ' + bl.blockTitle);
          if (bl.page) lines.push('*(' + bl.page + '쪽)*');
          lines.push('');
          lines.push(U.htmlToMarkdown(bl.body) || '*(본문 없음)*');
          lines.push('');
          if (bl.tags && bl.tags.length) lines.push('태그: ' + bl.tags.map(function (t) { return '#' + t; }).join(' '));
          return Store.listThoughts(bl.id).then(function (ths) {
            ths.sort(function (a, b) { return a.order - b.order; });
            ths.forEach(function (th) {
              lines.push(''); lines.push('> 💭 ' + U.htmlToMarkdown(th.body).replace(/\n/g, '\n> '));
            });
            lines.push(''); lines.push('---'); lines.push('');
          });
        });
      });
      return chain.then(function () {
        var blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
        download(blob, (book.title || 'book').replace(/[\\/:*?"<>|]/g, '_') + '.md');
      });
    });
  }

  return { exportAll: exportAll, importZip: importZip, exportBookMarkdown: exportBookMarkdown };
})();
