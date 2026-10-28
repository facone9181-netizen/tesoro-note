/* pharmarom tesoro — 데이터 모델 조작 (로컬 우선 + 동기화 큐 적재) */
window.Store = (function () {
  'use strict';

  // 변경을 로컬에 저장하고 동기화 큐에 적재 → Sync가 서버로 push
  function persist(kind, obj) {
    obj.updatedAt = U.now();
    obj.version = (obj.version || 0) + 1;
    obj.dirty = true; // 서버 반영 전
    return DB.put(storeName(kind), obj).then(function () {
      return DB.enqueue({ kind: kind, id: obj.id, at: U.now() });
    }).then(function () {
      if (window.Sync) Sync.kick();
      return obj;
    });
  }
  function storeName(kind) {
    return kind === 'book' ? 'books' : kind === 'block' ? 'blocks' : 'thoughts';
  }

  // ---------- BOOK ----------
  function newBook(data) {
    var t = U.now();
    var b = {
      id: U.uuid(), kind: 'book',
      readStartMonth: data.readStartMonth || '',
      status: data.status || 'before',
      title: data.title || '', author: data.author || '', publisher: data.publisher || '',
      isbn13: data.isbn13 || '', yes24Id: data.yes24Id || '', yes24Link: data.yes24Link || '',
      coverUrl: data.coverUrl || '', coverPhotoId: data.coverPhotoId || '',
      finishedDate: data.finishedDate || null,
      // YES24 원본 보관 (재조회해도 사용자 수정값 미덮어씀)
      origTitle: data.origTitle || data.title || '', origAuthor: data.origAuthor || data.author || '',
      origPublisher: data.origPublisher || data.publisher || '',
      source: data.source || 'manual', // 'yes24' | 'manual'
      createdAt: t, updatedAt: t, version: 0, deleted: false, order: t
    };
    return persist('book', b).then(function () { return b; });
  }
  function saveBook(b) { return persist('book', b); }

  function deleteBook(id) {
    return DB.get('books', id).then(function (b) {
      if (!b) return;
      b.deleted = true; b.deletedAt = U.now();
      // 하위 블록·생각도 함께 휴지통 (관계 표시)
      return DB.byIndex('blocks', 'bookId', id).then(function (blocks) {
        var chain = Promise.resolve();
        blocks.forEach(function (bl) {
          if (!bl.deleted) {
            bl.deleted = true; bl.deletedAt = U.now(); bl.deletedBy = 'book';
            chain = chain.then(function () { return persist('block', bl); });
            chain = chain.then(function () { return DB.byIndex('thoughts', 'blockId', bl.id); })
              .then(function (ths) {
                var c2 = Promise.resolve();
                ths.forEach(function (th) {
                  if (!th.deleted) { th.deleted = true; th.deletedAt = U.now(); th.deletedBy = 'book'; c2 = c2.then(function () { return persist('thought', th); }); }
                });
                return c2;
              });
          }
        });
        return chain;
      }).then(function () { return persist('book', b); });
    });
  }
  function restoreBook(id) {
    return DB.get('books', id).then(function (b) {
      if (!b) return;
      b.deleted = false; b.deletedAt = null;
      return DB.byIndex('blocks', 'bookId', id).then(function (blocks) {
        var chain = Promise.resolve();
        blocks.forEach(function (bl) {
          if (bl.deleted && bl.deletedBy === 'book') {
            bl.deleted = false; bl.deletedAt = null; bl.deletedBy = null;
            chain = chain.then(function () { return persist('block', bl); })
              .then(function () { return DB.byIndex('thoughts', 'blockId', bl.id); })
              .then(function (ths) {
                var c2 = Promise.resolve();
                ths.forEach(function (th) {
                  if (th.deleted && th.deletedBy === 'book') { th.deleted = false; th.deletedAt = null; th.deletedBy = null; c2 = c2.then(function () { return persist('thought', th); }); }
                });
                return c2;
              });
          }
        });
        return chain;
      }).then(function () { return persist('book', b); });
    });
  }

  // ---------- BLOCK ----------
  function newBlock(bookId, data) {
    data = data || {};
    var t = U.now();
    var bl = {
      id: data.id || U.uuid(), kind: 'block', bookId: bookId,
      type: data.type || 'manual', // 'photo' | 'manual'
      body: data.body || '', origOcrText: data.origOcrText || '',
      page: data.page || '', blockTitle: data.blockTitle || '',
      recordDate: data.recordDate || t, tags: data.tags || [], favorite: !!data.favorite,
      photoId: data.photoId || '', photoFileId: data.photoFileId || '',
      ocrStatus: data.ocrStatus || 'none', // none|pending|waitingNet|processing|done|failed
      createdAt: t, updatedAt: t, version: 0, deleted: false,
      order: data.order != null ? data.order : t,       // 표시용(추가순 기본)
      manualOrder: data.manualOrder != null ? data.manualOrder : t // 수동순 별도 보존
    };
    return persist('block', bl).then(function () { return bl; });
  }
  function saveBlock(bl) { return persist('block', bl); }
  function deleteBlock(id) {
    return DB.get('blocks', id).then(function (bl) {
      if (!bl) return;
      bl.deleted = true; bl.deletedAt = U.now(); bl.deletedBy = 'self';
      return DB.byIndex('thoughts', 'blockId', id).then(function (ths) {
        var chain = Promise.resolve();
        ths.forEach(function (th) {
          if (!th.deleted) { th.deleted = true; th.deletedAt = U.now(); th.deletedBy = 'block'; chain = chain.then(function () { return persist('thought', th); }); }
        });
        return chain;
      }).then(function () { return persist('block', bl); });
    });
  }
  function restoreBlock(id) {
    return DB.get('blocks', id).then(function (bl) {
      if (!bl) return;
      bl.deleted = false; bl.deletedAt = null; bl.deletedBy = null;
      return DB.byIndex('thoughts', 'blockId', id).then(function (ths) {
        var chain = Promise.resolve();
        ths.forEach(function (th) {
          if (th.deleted && th.deletedBy === 'block') { th.deleted = false; th.deletedAt = null; th.deletedBy = null; chain = chain.then(function () { return persist('thought', th); }); }
        });
        return chain;
      }).then(function () { return persist('block', bl); });
    });
  }

  // ---------- THOUGHT ----------
  function newThought(block, data) {
    data = data || {};
    var t = U.now();
    var th = {
      id: U.uuid(), kind: 'thought', blockId: block.id, bookId: block.bookId,
      body: data.body || '', createdAt: t, updatedAt: t, version: 0,
      deleted: false, order: data.order != null ? data.order : t
    };
    return persist('thought', th).then(function () { return th; });
  }
  function saveThought(th) { return persist('thought', th); }
  function deleteThought(id) {
    return DB.get('thoughts', id).then(function (th) {
      if (!th) return;
      th.deleted = true; th.deletedAt = U.now(); th.deletedBy = 'self';
      return persist('thought', th);
    });
  }
  function restoreThought(id) {
    return DB.get('thoughts', id).then(function (th) {
      if (!th) return;
      th.deleted = false; th.deletedAt = null; th.deletedBy = null;
      return persist('thought', th);
    });
  }

  // 영구 삭제 (로컬 + 서버 하드삭제 큐)
  function purge(kind, id) {
    var sn = storeName(kind);
    return DB.get(sn, id).then(function (obj) {
      var photoId = obj && obj.photoId;
      return DB.del(sn, id).then(function () {
        if (kind === 'block' && photoId) return DB.del('photos', photoId);
      }).then(function () {
        return DB.enqueue({ kind: kind, id: id, at: U.now(), purge: true });
      }).then(function () { if (window.Sync) Sync.kick(); });
    });
  }

  // ---------- 조회 ----------
  function listBooks() { return DB.all('books').then(function (a) { return a.filter(function (b) { return !b.deleted; }); }); }
  function listBlocks(bookId) {
    return DB.byIndex('blocks', 'bookId', bookId).then(function (a) { return a.filter(function (b) { return !b.deleted; }); });
  }
  function listThoughts(blockId) {
    return DB.byIndex('thoughts', 'blockId', blockId).then(function (a) { return a.filter(function (b) { return !b.deleted; }); });
  }
  function countBlocks(bookId) { return listBlocks(bookId).then(function (a) { return a.length; }); }

  function trash() {
    return Promise.all([DB.all('books'), DB.all('blocks'), DB.all('thoughts')]).then(function (r) {
      return {
        books: r[0].filter(function (x) { return x.deleted; }),
        // 책/블록 삭제로 딸려간 것(deletedBy='book'/'block')은 상위 항목에서 복구하므로 목록 노출 생략
        blocks: r[1].filter(function (x) { return x.deleted && x.deletedBy === 'self'; }),
        thoughts: r[2].filter(function (x) { return x.deleted && x.deletedBy === 'self'; })
      };
    });
  }

  return {
    newBook: newBook, saveBook: saveBook, deleteBook: deleteBook, restoreBook: restoreBook,
    newBlock: newBlock, saveBlock: saveBlock, deleteBlock: deleteBlock, restoreBlock: restoreBlock,
    newThought: newThought, saveThought: saveThought, deleteThought: deleteThought, restoreThought: restoreThought,
    purge: purge, listBooks: listBooks, listBlocks: listBlocks, listThoughts: listThoughts,
    countBlocks: countBlocks, trash: trash, persist: persist
  };
})();
