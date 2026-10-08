const CACHE_NAME = 'wordle-cache-v8';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=1.0.8',
  './app.js?v=1.0.8',
  './words.js',
  './manifest.json',
  './icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;700;800&display=swap',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js'
];

// Install Event - cache core static resources
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching static assets');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Event - clear old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Network-First for HTML/entry-points, Cache-First for versioned static assets
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  
  // Identify if it's an entry point document (navigation or root HTML)
  const isHtml = e.request.mode === 'navigate' || 
                 url.pathname === '/' || 
                 url.pathname.endsWith('/index.html') || 
                 url.pathname.endsWith('/');
                 
  if (isHtml) {
    // Network-First strategy
    e.respondWith(
      fetch(e.request)
        .then((networkResponse) => {
          // Cache the fresh copy
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, networkResponse.clone());
            return networkResponse;
          });
        })
        .catch(() => {
          // If network fails (offline), load from cache
          return caches.match(e.request);
        })
    );
  } else {
    // Cache-First strategy for static assets
    e.respondWith(
      caches.match(e.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        return fetch(e.request).then((networkResponse) => {
          // Dynamically cache GET requests (e.g. webfont files from gstatic)
          if (e.request.method === 'GET' && (e.request.url.startsWith('http') || e.request.url.startsWith('https'))) {
            return caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, networkResponse.clone());
              return networkResponse;
            });
          }
          return networkResponse;
        }).catch((err) => {
          console.error('[Service Worker] Fetch failed:', err);
        });
      })
    );
  }
});
