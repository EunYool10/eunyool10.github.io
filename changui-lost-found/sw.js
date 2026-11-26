// 앱 화면 파일만 저장해 두어 인터넷이 약할 때도 열리게 합니다.
// 물건 목록과 채팅은 Firebase가 따로 저장하므로 여기서 다루지 않습니다.
const CACHE = 'lostfound-2.0.1';
const SHELL = ['./app/', './app/index.html', './app/app.css?v=2.0.1', './app/app.js?v=2.0.1', './app/config.js',
  './icons/icon-192.png', './icons/icon-512.png', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('.apk')) return;
  // 화면 파일: 새 버전을 먼저 받아 보고, 안 되면 저장해 둔 것을 씁니다.
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
    }
    return res;
  }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('./app/index.html'))));
});
