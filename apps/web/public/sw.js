const CACHE_PREFIX = "ai-mentor-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v3`;
const SHELL_URLS = ["./", "./manifest.webmanifest", "./icons/icon.svg"];

function isSensitiveRequest(url) {
  return ["/auth/v1/", "/rest/v1/", "/graphql/v1", "/realtime/v1/"].some(
    (path) => url.pathname.includes(path),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheApplicationShell());
  self.skipWaiting();
});

async function cacheApplicationShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(SHELL_URLS);
  const indexResponse = await fetch("./");
  const html = await indexResponse.text();
  const assetUrls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => new URL(match[1], self.registration.scope))
    .filter(
      (url) =>
        url.origin === self.location.origin &&
        !isSensitiveRequest(url) &&
        url.pathname.includes("/assets/"),
    )
    .map((url) => url.href);
  await cache.addAll(assetUrls);
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    isSensitiveRequest(url)
  )
    return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put("./", copy));
          }
          return response;
        })
        .catch(() => caches.match("./")),
    );
    return;
  }

  const versionedAsset =
    url.pathname.includes("/assets/") ||
    request.destination === "image" ||
    request.destination === "font" ||
    url.pathname.endsWith("manifest.webmanifest");

  if (!versionedAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, copy));
        }
        return response;
      });

      return cached || network;
    }),
  );
});
