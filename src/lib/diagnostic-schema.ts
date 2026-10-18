// Keep only public route names. Never retain query strings, fragments, IDs or exception text.
export const pageRoutes = [
  "/",
  "/quests",
  "/savings",
  "/explore",
  "/us",
  "/login",
  "/register",
  "/account",
  "/pairing",
  "/explore/dates",
  "/explore/wishlist",
  "/explore/calendar",
  "/explore/memories",
  "/explore/letters",
  "/explore/mood",
  "/explore/roulette",
  "/explore/pet",
] as const;
export const browserCodes = ["runtime", "promise", "render", "asset"] as const;
export type BrowserCode = (typeof browserCodes)[number];
export function safeErrorRoute(path: string) {
  if ((pageRoutes as readonly string[]).includes(path)) return path;
  if (
    /^\/api\/(account|quests|planning|journal|pet|backup|push|diagnostics)\/(state|history|context|couple|invitation|accept|revoke|profile|save|delete|complete|redeem|deposit|reverse|letter|photo|feed|purchase|equip|rename|start|export-part|preview|upload-part|commit|cancel|subscribe|unsubscribe|test|report)$/.test(
      path,
    )
  )
    return path;
  if (path.startsWith("/api/auth/")) return "/api/auth";
  return "other";
}
