/* global self, caches */
// The build replaces these placeholders with a content version and an explicit public-file allowlist.
const CACHE = "olw-static-__VERSION__";
const FILES = __FILES__;
const ALLOWED = new Set(FILES);
const ROUTES = __ROUTES__;
const INTEGRITY = __INTEGRITY__;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        // Bound concurrency and fail the whole install if any build asset is missing.
        for (let i = 0; i < FILES.length; i += 4) {
          await Promise.all(
            FILES.slice(i, i + 4).map(async (url) => {
              // Cloudflare redirects *.html to clean URLs; cache the canonical response under its build filename.
              const source = url.endsWith(".html")
                ? url === "/index.html"
                  ? "/"
                  : url.slice(0, -5)
                : url;
              const response = await fetch(
                new Request(source, {
                  cache: "reload",
                  credentials: "omit",
                  integrity: INTEGRITY[url],
                }),
              );
              if (!response.ok || response.redirected)
                throw Error("Incomplete offline build");
              await cache.put(url, response);
            }),
          );
        }
      } catch (error) {
        await caches.delete(CACHE);
        throw error;
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Retain one previous build for an already open page that still needs its hashed chunks.
      const old = (await caches.keys()).filter(
        (key) => key.startsWith("olw-static-") && key !== CACHE,
      );
      await Promise.all(old.slice(0, -1).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "PUSH_CAPABLE") {
    event.ports[0]?.postMessage({ push: true });
    return;
  }
  if (event.data?.type !== "APPLY_UPDATE" || !event.source) return;
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // A different tab may have an in-flight write or an unsaved form. Never reload it implicitly.
      if (clients.length !== 1 || clients[0].id !== event.source.id) {
        event.source.postMessage({ type: "UPDATE_BLOCKED" });
        return;
      }
      await self.skipWaiting();
    })(),
  );
});

const PUSH_ROUTES = {
  quests: "/quests",
  dates: "/explore/dates",
  letters: "/explore/letters",
  test: "/us",
};
const PUSH_TEXT = {
  quests: "มีภารกิจที่ยังรอเราอยู่วันนี้",
  dates: "ใกล้ถึงเวลานัดหมายของเราแล้ว",
  letters: "จดหมายจากอีกคนพร้อมเปิดอ่านแล้ว",
  test: "เครื่องนี้รับการแจ้งเตือนของเราได้แล้ว",
};
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    /* Always show a visible, generic notification. */
  }
  const kind = Object.hasOwn(PUSH_ROUTES, payload.kind) ? payload.kind : "test";
  const tag =
    typeof payload.tag === "string" && /^[a-f0-9-]{36}$/.test(payload.tag)
      ? "olw-push:" + payload.tag
      : "olw-push";
  event.waitUntil(
    self.registration.showNotification("Our Little World", {
      body: PUSH_TEXT[kind],
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag,
      renotify: false,
      data: { url: PUSH_ROUTES[kind] },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url;
  const url = Object.values(PUSH_ROUTES).includes(path) ? path : "/us";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const current = windows.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (current) {
        current.postMessage({ type: "PUSH_OPEN", url });
        await current.focus();
      } else
        await self.clients.openWindow(new URL(url, self.location.origin).href);
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // API, sessions, photos, letters, POSTs and unknown URLs always use the network.
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;
  let pathname;
  try {
    pathname = url.pathname
      .split("/")
      .map((part) => encodeURIComponent(decodeURIComponent(part)))
      .join("/");
  } catch {
    return;
  }
  const key = request.mode === "navigate" ? ROUTES[pathname] : pathname;
  if (!key || (!ALLOWED.has(key) && !key.startsWith("/_next/static/"))) return;
  event.respondWith(
    (async () => {
      const cached = await (await caches.open(CACHE)).match(key);
      if (cached) return cached;
      // Only immutable hashed chunks may fall back to an older build.
      if (key.startsWith("/_next/static/")) {
        const previous = await caches.match(key);
        if (previous) return previous;
      }
      return fetch(request);
    })(),
  );
});
