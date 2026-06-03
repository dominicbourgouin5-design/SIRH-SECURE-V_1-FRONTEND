// core/api.js - Version complète

export async function secureFetch(url, options = {}) {
  const token = localStorage.getItem("sirh_token");
  const headers = { ...options.headers };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  // 🔥 Si hors-ligne, essayer le cache immédiatement
  if (!navigator.onLine) {
    console.log("📡 Hors-ligne, tentative de lecture depuis le cache...");
    
    try {
      const cache = await caches.open("sirh-cache-v7");
      const cachedResponse = await cache.match(url);
      
      if (cachedResponse) {
        console.log("✅ Cache hit pour:", url);
        return cachedResponse;
      }
      
      // Essayer localStorage pour les données critiques
      if (url.includes("/read-payroll-full") || url.includes("/read")) {
        const cachedData = localStorage.getItem('sirh_employees_cache');
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          return new Response(JSON.stringify({
            data: parsed.data || parsed,
            meta: { total: (parsed.data || parsed).length, page: 1, last_page: 1 }
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      
      if (url.includes("/list-mobile-locations")) {
        const cachedZones = localStorage.getItem('sirh_zones_cache');
        if (cachedZones) {
          const parsed = JSON.parse(cachedZones);
          return new Response(JSON.stringify(parsed.data || parsed), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      
      if (url.includes("/list-products")) {
        const cachedProducts = localStorage.getItem('sirh_products_cache');
        if (cachedProducts) {
          return new Response(cachedProducts, {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      
    } catch (e) {
      console.warn("Erreur lecture cache:", e);
    }
    
    throw new Error("Mode hors-ligne - Données non disponibles en cache");
  }

  // Mode en ligne normal
  const TIMEOUT_MS = 120000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      headers: headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage = `Erreur serveur (${response.status})`;
      try {
        const errData = await response.json();
        if (errData.error) errorMessage = errData.error;
      } catch (e) {}

      if (response.status === 401) {
        Swal.fire({
          title: "Session expirée",
          text: "Veuillez vous reconnecter.",
          icon: "info",
        }).then(() => {
          if (typeof window.handleLogout === "function") window.handleLogout();
        });
        throw new Error("Session expirée.");
      }

      if (response.status === 403) {
        throw new Error(errorMessage || "Accès refusé.");
      }
      throw new Error(errorMessage);
    }
    
    // Mettre en cache les réponses GET importantes
    if (options.method !== 'POST' && options.method !== 'PUT' && options.method !== 'DELETE') {
      const clone = response.clone();
      caches.open("sirh-cache-v7").then(cache => {
        cache.put(url, clone);
      });
    }
    
    return response;
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === "AbortError") {
      throw new Error("Le serveur met trop de temps à répondre. Réessayez.");
    }
    
    throw error;
  }
}
