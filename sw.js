// Klapkolist service worker: keeps the whole app on the phone, so it opens with no signal.
// Strategy: always answer from the phone's copy. Each time the app is opened with a signal,
// fetch every file anew in the background, and only if all of them arrive, replace the copy
// in one go (so the app is never half old, half new). After you upload a new version, the app
// updates on the next launch after that.
//
// FILES must list every file the app uses (tests/files.test.js checks it).
const CACHE = 'klapkolist';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/fonts.css',
  './styles/app.css',
  './fonts/roboto-mono-latin.woff2',
  './fonts/roboto-mono-latin-ext.woff2',
  './fonts/stack-sans-headline-latin.woff2',
  './fonts/stack-sans-headline-latin-ext.woff2',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/main.js',
  './js/util.js',
  './js/model.js',
  './js/sheet.js',
  './js/store.js',
  './js/dom.js',
  './js/ui.js',
  './js/nav.js',
  './js/keyboard.js',
  './js/suggest.js',
  './js/files.js',
  './js/screens/projects.js',
  './js/screens/days.js',
  './js/screens/import.js',
  './js/screens/day.js',
  './js/screens/take.js',
  './js/screens/export.js',
  './js/screens/settings.js',
  './js/screens/dictionary.js'
];

// All files fresh from the server, or null if any of them failed.
async function fetchAll(){
  try{
    const res = await Promise.all(FILES.map(f => fetch(f, { cache: 'no-cache' })));
    return res.every(r => r.ok) ? res : null;
  }catch{ return null; }
}
async function refreshCopy(){
  const res = await fetchAll();
  if (!res) return false;
  const cache = await caches.open(CACHE);
  await Promise.all(FILES.map((f, i) => cache.put(f, res[i])));
  return true;
}

self.addEventListener('install', e => {
  e.waitUntil(refreshCopy().then(ok => { if (!ok) throw new Error('offline copy incomplete'); return self.skipWaiting(); }));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const navigating = req.mode === 'navigate';
  if (navigating) e.waitUntil(refreshCopy());
  e.respondWith(
    caches.match(navigating ? './index.html' : req, { ignoreSearch: true })
      .then(cached => cached || fetch(req))
  );
});
