/* Vettly's service worker: keeps the app's own files (and its fonts) on the device, so an installed app paints at
   once and the phone's plain launch screen only flashes before the logo's splash. Every css/js file is requested with
   ?v=…, so a cached copy is never stale (files without it are refreshed behind the scenes); the page itself and the API always come from the network. */
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
        const fresh = () => fetch(req).then(res => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; });
        // a versioned file (?v=…, or a version in its name under vendor/) never changes: the copy on the device is enough.
        // Anything else (images, icons, fonts) is shown from the device at once and refreshed behind for next time.
        const fixed = url.searchParams.has('v') || url.pathname.includes('/vendor/');
        if (hit && !fixed) e.waitUntil(fresh().catch(() => {}));
        return hit || fresh();
    }));
});
