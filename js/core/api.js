// core/api.js

export async function secureFetch(url, options = {}) {
  // Version avec support hors-ligne
  const token = localStorage.getItem("sirh_token");
  
  // 1. On clone les headers
  const headers = { ...options.headers };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (options.body) {
    if (options.body instanceof FormData) {
      delete headers["Content-Type"];
    } else {
      headers["Content-Type"] = "application/json";
    }
  }

  const TIMEOUT_MS = 120000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // Tentative réseau
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
    return response;
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === "AbortError") {
      throw new Error("Le serveur met trop de temps à répondre. Réessayez.");
    }
    
    // 🔥 NOUVEAU : Si hors-ligne, essayer le cache
    if (!navigator.onLine || error.message.includes("Failed to fetch")) {
      console.log("📡 Hors-ligne détecté, tentative de lecture depuis le cache...");
      
      // Essayer de lire depuis le cache du Service Worker
      const cache = await caches.open("sirh-cache-v6");
      const cachedResponse = await cache.match(url);
      
      if (cachedResponse) {
        console.log("✅ Données servies depuis le cache pour:", url);
        return cachedResponse;
      }
      
      // Si pas de cache, essayer le localStorage
      if (url.includes("/read-payroll-full")) {
        const cachedData = localStorage.getItem('sirh_employees_cache');
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          return new Response(JSON.stringify({
            data: parsed.data,
            meta: { total: parsed.data.length, page: 1, last_page: 1 }
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      
      throw new Error("Vous êtes hors ligne et aucune donnée n'est disponible en cache.");
    }
    
    throw error;
  }
}
