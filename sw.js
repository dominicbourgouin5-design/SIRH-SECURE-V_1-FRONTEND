const CACHE_NAME = "sirh-cache-v6";
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

// Activation - nettoyage des anciens caches
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

// Stratégie de fetch : Cache d'abord, puis réseau
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  
  // Pour les requêtes API GET (lecture des données)
  if (e.request.method === 'GET' && url.pathname.includes('/api/')) {
    e.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          // On tente le réseau d'abord pour les données fraîches
          const networkResponse = await fetch(e.request);
          if (networkResponse && networkResponse.status === 200) {
            cache.put(e.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          // Si hors-ligne, on sert le cache
          const cachedResponse = await cache.match(e.request);
          if (cachedResponse) {
            console.log("📡 SW: Service hors-ligne - données depuis cache");
            return cachedResponse;
          }
          // Si pas de cache, on retourne une erreur
          return new Response(JSON.stringify({ error: "Hors ligne", data: [] }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      })
    );
    return;
  }
  
  // Pour les fichiers statiques (CSS, JS, HTML)
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request).catch(() => {
        // Si c'est une page HTML et qu'on est hors-ligne, on sert la page d'accueil
        if (e.request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html');
        }
        return new Response('Hors ligne', { status: 503 });
      });
    })
  );
});

// Notifications Push
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
