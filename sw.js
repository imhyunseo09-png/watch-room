// 같이 보는 방 — 앱 설치용 작은 서비스 워커
// 늘 인터넷에서 새 파일을 먼저 받고, 안 되면 마지막으로 받아 둔 것을 쓴다(고친 내용이 바로 반영되게).
const CACHE = 'watch-room-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })));
});
