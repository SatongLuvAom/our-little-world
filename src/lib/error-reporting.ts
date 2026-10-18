import {
  safeErrorRoute,
  type BrowserCode,
  pageRoutes,
} from "./diagnostic-schema";
let remaining = 3;
const sent = new Set<string>();
export function reportClientError(code: BrowserCode) {
  if (typeof window === "undefined" || !navigator.onLine || remaining <= 0)
    return;
  const route = safeErrorRoute(location.pathname),
    key = route + ":" + code;
  if (!(pageRoutes as readonly string[]).includes(route) || sent.has(key))
    return;
  sent.add(key);
  remaining--;
  // No offline queue, storage, exception payload or automatic retry. Monitoring cannot replay writes.
  void fetch("/api/diagnostics/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ route, code }),
    keepalive: true,
  }).catch(() => {});
}
