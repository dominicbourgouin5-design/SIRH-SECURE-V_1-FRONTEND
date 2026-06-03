const CACHE_NAME = "sirh-cache-v7";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./style.css",
  "./js/main.js",
  "./js/core/api.js",
  "./js/core/config.js",
  "./js/core/state.js",
  "./js/core/utils.js",
  "./js/modules/admin.js",
  "./js/modules/auth.js",
  "./js/modules/chat.js",
  "./js/modules/dashboard.js",
  "./js/modules/hr.js",
  "./js/modules/leaves.js",
  "./js/modules/ops.js",
  "./js/modules/payroll.js",
  "./js/modules/ui.js",
  "./js/modules/crm.js"
];

// Installation
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("📦 SW: Mise en cache des assets");
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// Activation - nettoyage
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("🧹 SW: Suppression ancien cache", cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Stratégie de fetch améliorée
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  
  // 1. Pour les fichiers statiques (CSS, JS, HTML) -> Cache d'abord
  if (e.request.destination === 'script' || 
      e.request.destination === 'style' || 
      e.request.destination === 'document' ||
      e.request.url.includes('.css') ||
      e.request.url.includes('.js')) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        return cached || fetch(e.request).catch(() => {
          return caches.match('./index.html');
        });
      })
    );
    return;
  }
  
  // 2. Pour les images et PDF -> Cache d'abord
  if (e.request.destination === 'image' || 
      e.request.url.includes('.pdf') ||
      e.request.url.includes('.jpg') ||
      e.request.url.includes('.png')) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }
  
  // 3. Pour les API GET -> Réseau d'abord, cache en fallback
  if (e.request.method === 'GET' && url.pathname.includes('/api/')) {
    e.respondWith(
      fetch(e.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(async () => {
        const cached = await caches.match(e.request);
        if (cached) {
          console.log("📡 API servie depuis le cache:", url.pathname);
          return cached;
        }
        return new Response(JSON.stringify({ error: "Hors ligne", data: [] }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }
  
  // 4. Pour tout le reste -> Cache d'abord
  e.respondWith(
    caches.match(e.request).then((cached) => {
      return cached || fetch(e.request).catch(() => {
        return new Response('Contenu non disponible hors ligne', { status: 503 });
      });
    })
  );
});

// Notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: 'https://cdn-icons-png.flaticon.com/512/9752/9752284.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/9752/9752284.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url || '/'));
});
