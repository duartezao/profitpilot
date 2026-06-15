/* ProfitPilot — service worker (PWA).
   Navegação: network-first com fallback em cache.
   Estáticos: cache após rede. API e dev tooling: não interceptar. */
const CACHE = "profitpilot-v3";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function offlineHtml() {
  return new Response(
    "<!DOCTYPE html><html lang=\"pt-PT\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Offline</title></head><body style=\"font-family:system-ui,sans-serif;padding:2rem;text-align:center\"><p>Sem ligação à internet.</p><p>Volta a tentar quando tiveres rede.</p></body></html>",
    {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
}

function shouldHandle(url, request) {
  if (url.origin !== self.location.origin) return false;
  if (request.method !== "GET") return false;
  if (url.pathname.startsWith("/api/")) return false;
  if (url.pathname.includes("webpack-hmr")) return false;
  if (url.pathname.startsWith("/__nextjs")) return false;

  if (request.mode === "navigate") return true;

  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(?:svg|png|ico|woff2?)$/i.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (!shouldHandle(url, request)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      try {
        const response = await fetch(request);
        if (response.ok && response.type === "basic") {
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;

        if (request.mode === "navigate") {
          const shell =
            (await caches.match("/dashboard")) || (await caches.match("/"));
          return shell ?? offlineHtml();
        }

        return new Response(null, { status: 503, statusText: "Offline" });
      }
    })(),
  );
});
