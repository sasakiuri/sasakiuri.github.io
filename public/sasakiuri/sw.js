const cachePrefix = "sasakiuri-";
const precacheVersion = "__PRECACHE_VERSION__";
const cacheName = `${cachePrefix}${precacheVersion}`;
const precacheUrls = ["__PRECACHE_URLS__"];

globalThis.addEventListener("install", (event) => {
  event.waitUntil(
    globalThis.caches
      .open(cacheName)
      .then((cache) => cache.addAll(precacheUrls))
      .then(() => globalThis.skipWaiting()),
  );
});

globalThis.addEventListener("activate", (event) => {
  event.waitUntil(
    globalThis.caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(cachePrefix) && key !== cacheName)
            .map((key) => globalThis.caches.delete(key)),
        ),
      )
      .then(() => globalThis.clients.claim()),
  );
});

globalThis.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== globalThis.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (["font", "image", "script", "style"].includes(request.destination)) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});

async function networkFirst(request) {
  const cache = await globalThis.caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) ?? (await cache.match("/sasakiuri/"));
  }
}

async function staleWhileRevalidate(request, event) {
  const cache = await globalThis.caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  const networkResponse = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  if (cachedResponse !== undefined) {
    event.waitUntil(networkResponse);
    return cachedResponse;
  }

  return (await networkResponse) ?? new Response("Offline", { status: 503 });
}
