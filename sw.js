const CACHE_NAME = 'mototrack-v5';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './db.js',
  './manifest.json'
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
  // No cachear peticiones a Supabase (siempre frescas)
  if (e.request.url.includes('supabase.co')) {
    e.respondWith(fetch(e.request));
    return;
  }
  // Cachear assets estáticos
  e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});