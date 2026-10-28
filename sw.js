/* pharmarom tesoro — 서비스워커 (앱 셸 오프라인 캐시) */
var CACHE = 'tesoro-note-v2';
var SHELL = [
  './', './index.html', './app.css',
  './js/util.js', './js/config.js', './js/db.js', './js/store.js', './js/photo.js',
  './js/editor.js', './js/api.js', './js/sync.js', './js/backup.js', './js/app.js', './js/app2.js',
  './manifest.json', './assets/logo.jpg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL).catch(function () {}); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return; // 백엔드 POST는 캐시하지 않음
  var url = new URL(req.url);
  if (url.origin !== location.origin) return; // 외부(폰트·CDN·백엔드)는 네트워크 그대로
  // 앱 셸: 캐시 우선, 네트워크 갱신
  e.respondWith(
    caches.match(req).then(function (cached) {
      var net = fetch(req).then(function (res) {
        if (res && res.status === 200) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      }).catch(function () { return cached; });
      return cached || net;
    })
  );
});
