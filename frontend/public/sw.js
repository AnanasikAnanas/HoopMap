const CACHE_NAME = "hoopmap-shell-v1";
const OFFLINE_ASSETS = [
  "/offline.html",
  "/icons/hoopmap-192.png",
  "/icons/hoopmap-512.png",
  "/icons/hoopmap-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(OFFLINE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match("/offline.html")),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() ?? "" };
  }
  const title = payload.title || "HOOPMAP";
  const url =
    typeof payload.url === "string" && payload.url.startsWith("/")
      ? payload.url
      : "/games";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "В HOOPMAP появилось обновление",
      icon: "/icons/hoopmap-192.png",
      badge: "/icons/hoopmap-badge-96.png",
      tag: payload.tag || "hoopmap-update",
      data: { url },
      vibrate: [120, 60, 120],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url || "/games";
  const destination = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clients) => {
        for (const client of clients) {
          if (new URL(client.url).origin === self.location.origin) {
            await client.focus();
            if ("navigate" in client) await client.navigate(destination);
            return;
          }
        }
        await self.clients.openWindow(destination);
      }),
  );
});
