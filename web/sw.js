/* Vettly's service worker: keeps the app's own files (and its fonts) on the device, so an installed app paints at
   once and the phone's plain launch screen only flashes before the logo's splash. Every css/js file is requested with
   ?v=…, so a cached copy is never stale; the page itself and the API always come from the network. */
const CACHE = 'vettly-static-1';
const STATIC = /\/(css|js|icons|img|vendor)\//;
const FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
    const req = e.request, url = new URL(req.url);
    if (req.method !== 'GET' || !((url.origin === location.origin && STATIC.test(url.pathname)) || FONTS.test(req.url))) return;
    e.respondWith(caches.open(CACHE).then(async cache => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
    }));
});
