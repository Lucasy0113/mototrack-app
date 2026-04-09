const CACHE_NAME = 'mototrack-v4';
const ASSETS = [
  '/mototrack-app/',
  '/mototrack-app/index.html',
  '/mototrack-app/style.css',
  '/mototrack-app/app.js',
  '/mototrack-app/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => 
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request).catch(() => caches.match('/mototrack-app/')))
  );
});