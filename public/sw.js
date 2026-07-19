// Minimal auto-updating service worker (replaces vite-plugin-pwa/workbox).
//
// Strategy:
// - /api/* is NEVER cached (payments, auth, webhooks).
// - Navigations: network-first, falling back to the last cached shell when
//   offline.
// - Hashed build assets + images: cache-first (immutable filenames).
// - Google Fonts: cache-first (mirrors the old workbox runtimeCaching rule).
//
// Bump CACHE_VERSION to force-invalidate old caches on deploy of a new SW.
const CACHE_VERSION = "v1";
const PAGE_CACHE = `pages-${CACHE_VERSION}`;
const ASSET_CACHE = `assets-${CACHE_VERSION}`;
const FONT_CACHE = `google-fonts-${CACHE_VERSION}`;

self.addEventListener("install", () => {
  // Activate the new SW immediately (autoUpdate behaviour).
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => ![PAGE_CACHE, ASSET_CACHE, FONT_CACHE].includes(key))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never touch API calls or Supabase/Midtrans requests.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    return;
  }

  // Google Fonts
  if (
    url.origin === "https://fonts.googleapis.com" ||
    url.origin === "https://fonts.gstatic.com"
  ) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // App navigations → network-first with offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, PAGE_CACHE));
    return;
  }

  // Hashed build assets and static files → cache-first.
  if (
    url.pathname.startsWith("/assets/") ||
    /\.(js|css|png|svg|ico|woff2?)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  }
});
