// Babipass — service worker.
// But : ouvrir le site et « Mes billets » même sans réseau (entrée des salles).
// Ne touche jamais à l'API, aux paiements ni aux sites tiers : seulement la page
// du site (toujours le réseau d'abord) et ses fichiers /assets/* (immuables).
const ASSETS = 'babipass-assets-v1';
const SHELL = 'babipass-shell-v1';
const SHELL_KEY = '/__shell';
const MAX_ASSETS = 150;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [ASSETS, SHELL];
    for (const name of await caches.keys()) if (!keep.includes(name)) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Fichiers du site (nom unique par version) : la mémoire d'abord.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSETS);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok) {
        await cache.put(request, response.clone());
        const keys = await cache.keys();
        for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(old);
      }
      return response;
    })());
    return;
  }

  // Pages : toujours la dernière version en ligne ; la copie gardée ne sert que hors connexion.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(SHELL);
          await cache.put(SHELL_KEY, response.clone());
        }
        return response;
      } catch (err) {
        const cached = await caches.match(SHELL_KEY);
        if (cached) return cached;
        throw err;
      }
    })());
  }
});
