/* pharmarom tesoro — IndexedDB 로컬 저장 (로컬 우선) */
window.DB = (function () {
  'use strict';
  var NAME = 'tesoro-note', VER = 1, db = null;

  // stores: books, blocks, thoughts, photos(blob), queue(동기화 대기), meta
  function open() {
    return new Promise(function (resolve, reject) {
      if (db) return resolve(db);
      var req = indexedDB.open(NAME, VER);
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains('books')) d.createObjectStore('books', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('blocks')) {
          var b = d.createObjectStore('blocks', { keyPath: 'id' });
          b.createIndex('bookId', 'bookId', { unique: false });
        }
        if (!d.objectStoreNames.contains('thoughts')) {
          var t = d.createObjectStore('thoughts', { keyPath: 'id' });
          t.createIndex('blockId', 'blockId', { unique: false });
          t.createIndex('bookId', 'bookId', { unique: false });
        }
        if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('queue')) d.createObjectStore('queue', { keyPath: 'qid', autoIncrement: true });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'k' });
      };
      req.onsuccess = function () { db = req.result; resolve(db); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function tx(store, mode) {
    return open().then(function (d) {
      return d.transaction(store, mode).objectStore(store);
    });
  }
  function reqP(r) {
    return new Promise(function (res, rej) {
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }

  function put(store, obj) { return tx(store, 'readwrite').then(function (s) { return reqP(s.put(obj)); }); }
  function get(store, id) { return tx(store, 'readonly').then(function (s) { return reqP(s.get(id)); }); }
  function del(store, id) { return tx(store, 'readwrite').then(function (s) { return reqP(s.delete(id)); }); }
  function all(store) {
    return tx(store, 'readonly').then(function (s) { return reqP(s.getAll()); });
  }
  function byIndex(store, index, value) {
    return tx(store, 'readonly').then(function (s) {
      return reqP(s.index(index).getAll(value));
    });
  }
  function clear(store) { return tx(store, 'readwrite').then(function (s) { return reqP(s.clear()); }); }

  // 큐: 동기화 대기 작업 (멱등 — 같은 엔터티 중복은 서버에서 upsert 처리)
  function enqueue(op) {
    return tx('queue', 'readwrite').then(function (s) { return reqP(s.add(op)); });
  }
  function queueAll() { return all('queue'); }
  function dequeue(qid) { return del('queue', qid); }

  function metaGet(k) { return get('meta', k).then(function (r) { return r ? r.v : undefined; }); }
  function metaSet(k, v) { return put('meta', { k: k, v: v }); }

  return {
    put: put, get: get, del: del, all: all, byIndex: byIndex, clear: clear,
    enqueue: enqueue, queueAll: queueAll, dequeue: dequeue,
    metaGet: metaGet, metaSet: metaSet
  };
})();
