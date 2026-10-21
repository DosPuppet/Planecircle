/**
 * Planecircle service worker (production build only, registered by main.tsx).
 * - /assets/* (named by their hash), /sounds/* and /mana/* (mana symbols): from the cache after the first visit; a new version of a file
 *   replaces the old one (same name prefix);
 * - the page: network first, cache when offline (a game against the AI without network; the Scryfall images stay
 *   with the browser).
 * Neither online play (/ws), nor the image relay (/scry/), nor /healthz go through the cache; nor the arena of the 3D board
 * (/arena/, about 12 MB, downloaded only with it): the browser's HTTP cache keeps its hashed files for a year.
 */
const CACHE = "planecircle-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** "index-CtvfSpgD.js" → "index-": the old versions of the same file. */
const prefixOf = (path) => path.replace(/-[\w-]{6,}\.(js|css)$/, "-");

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/assets/")) {
      const prefix = prefixOf(path);
      for (const old of await cache.keys()) {
        const p = new URL(old.url).pathname;
        if (p !== path && p.startsWith("/assets/") && prefixOf(p) === prefix) await cache.delete(old);
      }
    }
    await cache.put(request, res.clone());
  }
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put("/", res.clone());
    return res;
  } catch {
    return (await cache.match("/")) ?? Response.error();
  }
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/sounds/") || url.pathname.startsWith("/mana/"))
    e.respondWith(cacheFirst(e.request));
  else if (e.request.mode === "navigate") e.respondWith(networkFirst(e.request));
});
