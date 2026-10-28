/* pharmarom tesoro — 동기화 엔진 (로컬 우선 push/pull, 중복 방지, 충돌 보존) */
window.Sync = (function () {
  'use strict';
  var state = 'idle'; // idle | saving | synced | offline | error
  var listeners = [];
  var running = false, pending = false;
  var conflicts = []; // {kind,id,local,server}

  function on(fn) { listeners.push(fn); }
  function setState(s) { state = s; listeners.forEach(function (fn) { try { fn(s); } catch (e) {} }); }
  function getState() { return state; }
  function getConflicts() { return conflicts.slice(); }

  function online() { return navigator.onLine !== false; }

  // UI가 변경을 저장할 때마다 호출 → 디바운스 flush
  var kickDebounced = U.debounce(function () { flush(); }, 800);
  function kick() {
    if (!CONFIG.isLoggedIn()) { setState('saving'); return; } // 백엔드 미설정: 로컬만
    if (!online()) { setState('offline'); return; }
    setState('saving');
    kickDebounced();
  }

  function storeName(kind) { return kind === 'book' ? 'books' : kind === 'block' ? 'blocks' : 'thoughts'; }

  // 큐를 모아 서버로 push → 응답으로 충돌/반영 처리, 그 후 pull
  function flush() {
    if (!CONFIG.isLoggedIn()) { setState('saving'); return Promise.resolve(); }
    if (!online()) { setState('offline'); return Promise.resolve(); }
    if (running) { pending = true; return Promise.resolve(); }
    running = true;
    return DB.queueAll().then(function (queue) {
      if (!queue.length) return pull();
      // 큐를 엔터티별 최신 상태로 합침 (중복 id는 1건으로 — 멱등)
      var byKey = {}; var order = [];
      queue.forEach(function (q) {
        var key = q.kind + ':' + q.id;
        if (!byKey[key]) order.push(key);
        byKey[key] = q; // 최신 것으로 덮음
      });
      // 먼저 사진 미업로드 블록 업로드 처리
      return uploadPendingPhotos().then(function () {
        return Promise.all(order.map(function (key) {
          var q = byKey[key];
          if (q.purge) return Promise.resolve({ kind: q.kind, id: q.id, purge: true });
          return DB.get(storeName(q.kind), q.id).then(function (obj) {
            if (!obj) return null;
            return { kind: q.kind, id: q.id, obj: stripLocal(obj), baseVersion: obj.serverVersion || 0 };
          });
        }));
      }).then(function (changes) {
        changes = changes.filter(Boolean);
        if (!changes.length) return pull();
        return API.push(changes).then(function (res) {
          if (!res || !res.ok) throw new Error(res && res.error || 'push-failed');
          return applyPushResult(res.results || []).then(function () {
            // 큐 비우기 (반영된 것)
            return DB.queueAll().then(function (qs) {
              return Promise.all(qs.map(function (q) { return DB.dequeue(q.qid); }));
            });
          }).then(function () { return pull(); });
        });
      });
    }).then(function () {
      running = false;
      if (pending) { pending = false; return flush(); }
      if (conflicts.length) { setState('error'); }
      else setState('synced');
    }).catch(function (e) {
      running = false;
      setState(online() ? 'error' : 'offline');
    });
  }

  function stripLocal(obj) {
    var o = Object.assign({}, obj);
    delete o.dirty; delete o.serverVersion;
    return o;
  }

  // 사진 blob이 있지만 서버 photoFileId가 없는 블록 → 업로드 + OCR
  function uploadPendingPhotos() {
    return DB.all('blocks').then(function (blocks) {
      var targets = blocks.filter(function (b) {
        return !b.deleted && b.photoId && !b.photoFileId &&
          (b.ocrStatus === 'waitingNet' || b.ocrStatus === 'pending' || b.ocrStatus === 'failed');
      });
      var chain = Promise.resolve();
      targets.forEach(function (b) {
        chain = chain.then(function () {
          return DB.get('photos', b.photoId).then(function (p) {
            if (!p || !p.blob) return;
            b.ocrStatus = 'processing';
            return Store.saveBlock(b).then(function () { return Photo.blobToBase64(p.blob); })
              .then(function (b64) { return API.uploadPhoto(b.photoId, b64); })
              .then(function (up) {
                if (up && up.ok) {
                  b.photoFileId = up.photoFileId;
                  return API.ocr(b.photoFileId).then(function (oc) {
                    b.ocrStatus = (oc && oc.ok) ? 'done' : 'failed';
                    if (oc && oc.ok) {
                      b.origOcrText = oc.text || '';
                      // 사용자가 이미 쓴 본문은 덮어쓰지 않음
                      if (!U.htmlToText(b.body)) b.body = U.escapeHtml(oc.text || '').replace(/\n/g, '<br>');
                      else b.ocrCandidate = oc.text || ''; // 재인식 비교용
                    }
                    return Store.saveBlock(b);
                  });
                } else { b.ocrStatus = 'failed'; return Store.saveBlock(b); }
              }).catch(function () { b.ocrStatus = 'failed'; return Store.saveBlock(b); });
          });
        });
      });
      return chain;
    });
  }

  // push 응답 처리: 반영/충돌
  function applyPushResult(results) {
    var chain = Promise.resolve();
    conflicts = conflicts.filter(function (c) {
      // 이번에 보낸 것들의 이전 충돌은 제거 (갱신)
      return !results.some(function (r) { return r.kind === c.kind && r.id === c.id; });
    });
    results.forEach(function (r) {
      chain = chain.then(function () {
        if (r.purged) return;
        if (r.conflict) {
          // 서버가 덮어쓰지 않음 — 양쪽 보존
          return DB.get(storeName(r.kind), r.id).then(function (local) {
            conflicts.push({ kind: r.kind, id: r.id, local: local, server: r.server });
          });
        } else if (r.ok) {
          return DB.get(storeName(r.kind), r.id).then(function (local) {
            if (local) { local.dirty = false; local.serverVersion = r.version; return DB.put(storeName(r.kind), local); }
          });
        }
      });
    });
    return chain;
  }

  // 서버 변경분 받아 로컬 병합 (내 미반영 변경은 보호)
  function pull() {
    var since = CONFIG.get('lastSync') || 0;
    return API.pull(since).then(function (res) {
      if (!res || !res.ok) return;
      var chain = Promise.resolve();
      (res.changes || []).forEach(function (row) {
        chain = chain.then(function () {
          var sn = storeName(row.kind);
          return DB.get(sn, row.id).then(function (local) {
            if (local && local.dirty) return; // 내 미반영 수정 보호 (다음 push에서 충돌 검사)
            row.serverVersion = row.version; row.dirty = false;
            if (row.kind === 'block' && row.photoFileId && !row.photoId) row.photoId = ''; // 사진은 필요시 lazy fetch
            return DB.put(sn, row);
          });
        });
      });
      return chain.then(function () {
        if (res.now) CONFIG.set('lastSync', res.now);
      });
    });
  }

  // 충돌 해결: 'local' 또는 'server' 선택
  function resolveConflict(kind, id, choice) {
    var c = null;
    conflicts = conflicts.filter(function (x) {
      if (x.kind === kind && x.id === id) { c = x; return false; }
      return true;
    });
    if (!c) return Promise.resolve();
    var sn = storeName(kind);
    if (choice === 'server') {
      var s = c.server; s.serverVersion = s.version; s.dirty = false;
      return DB.put(sn, s).then(function () { setState('synced'); });
    } else {
      // 내 수정본 유지 — 서버 버전을 base로 올려 다시 push하면 반영됨
      return DB.get(sn, id).then(function (local) {
        if (local) { local.serverVersion = c.server.version; local.dirty = true; return DB.put(sn, local).then(function () { return DB.enqueue({ kind: kind, id: id, at: U.now() }); }); }
      }).then(function () { kick(); });
    }
  }

  // 온라인 복귀 시
  window.addEventListener('online', function () { if (CONFIG.isLoggedIn()) { setState('saving'); flush(); } });
  window.addEventListener('offline', function () { setState('offline'); });

  // 초기 전체 동기화
  function initialSync() {
    if (!CONFIG.isLoggedIn()) return Promise.resolve();
    setState('saving');
    return flush();
  }

  return {
    on: on, getState: getState, kick: kick, flush: flush, pull: pull,
    getConflicts: getConflicts, resolveConflict: resolveConflict, initialSync: initialSync
  };
})();
