import { z } from "zod";
import { createAuth } from "./auth";
import { registerSchema } from "./auth-schema";

const signoutSchema = z.object({});
const verificationSchema = z.object({
  response: z.record(z.string(), z.unknown()),
  name: z.string().trim().max(120).optional(),
  createSession: z.boolean().optional(),
});
const registrationOptionsSchema = z.object({
  context: z.string().optional(),
  name: z.string().max(120).optional(),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
});
const assertionSchema = z.object({
  id: z.string(),
  rawId: z.string(),
  type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: z.string(),
    authenticatorData: z.string(),
    signature: z.string(),
    userHandle: z.string().optional(),
  }),
  // Better Auth's browser plugin omits these; they are not used for verification.
  clientExtensionResults: z.object({}).passthrough().default({}),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
});
const json = (body: unknown, status: number) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function rateLimit(request: Request, env: CloudflareEnv, path: string) {
  // Cloudflare overwrites this header at the edge; an absent address shares a bucket.
  const ip = request.headers.get("cf-connecting-ip")?.slice(0, 64) || "unknown";
  const key = "olw:" + path + ":" + ip;
  const now = Date.now(),
    cutoff = now - 60000;
  const max = path.startsWith("/passkey/") ? 30 : 60;
  // One atomic decision across isolates. Like Better Auth, the window resets after inactivity.
  const row = await env.DB.prepare(
    `
    INSERT INTO auth_rate_limit(id,key,count,lastRequest) VALUES(?,?,1,?)
    ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN lastRequest <= ? THEN 1 ELSE count+1 END,
      lastRequest=excluded.lastRequest
    WHERE lastRequest <= ? OR count < ?
    RETURNING count
  `,
  )
    .bind(key, key, now, cutoff, cutoff, max)
    .first<{ count: number }>();
  if (!row) {
    const previous = await env.DB.prepare(
      "SELECT lastRequest FROM auth_rate_limit WHERE key=?",
    )
      .bind(key)
      .first<{ lastRequest: number }>();
    const response = json({ message: "คำขอมากเกินไป กรุณารอสักครู่" }, 429);
    response.headers.set(
      "Retry-After",
      String(
        Math.max(
          1,
          Math.ceil(((previous?.lastRequest ?? now) + 60000 - now) / 1000),
        ),
      ),
    );
    return response;
  }
  if (row.count === 1)
    await env.DB.prepare("DELETE FROM auth_rate_limit WHERE lastRequest <= ?")
      .bind(cutoff)
      .run();
}
export async function handleAuthRequest(request: Request, env: CloudflareEnv) {
  const url = new URL(request.url);
  const path = url.pathname.replace("/api/auth", "");
  const allowed =
    request.method === "GET"
      ? [
          "/get-session",
          "/passkey/generate-register-options",
          "/passkey/generate-authenticate-options",
          "/passkey/list-user-passkeys",
        ].includes(path)
      : request.method === "POST" &&
        [
          "/passkey/verify-registration",
          "/passkey/verify-authentication",
          "/sign-out",
        ].includes(path);
  if (!allowed) return json({ error: "ไม่พบคำขอนี้" }, 404);
  const origin = new URL(env.APP_URL).origin;
  if (
    (request.method === "POST" && request.headers.get("Origin") !== origin) ||
    (request.headers.has("Origin") &&
      request.headers.get("Origin") !== origin) ||
    request.headers.get("Sec-Fetch-Site") === "cross-site"
  )
    return json({ error: "ไม่อนุญาตคำขอจากเว็บไซต์นี้" }, 403);
  const limited = await rateLimit(request, env, path);
  if (limited) return limited;
  if (path === "/passkey/generate-register-options") {
    const context = url.searchParams.get("context");
    if (context !== null) {
      if (context.length > 1024) return json({ error: "ข้อมูลยาวเกินไป" }, 413);
      try {
        const parsed = registerSchema.safeParse(JSON.parse(context));
        if (!parsed.success)
          return json(
            {
              error: "ตรวจสอบชื่อและชื่อผู้ใช้",
              fields: z.flattenError(parsed.error).fieldErrors,
            },
            400,
          );
        url.searchParams.set("context", JSON.stringify(parsed.data));
      } catch {
        return json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, 400);
      }
    }
    if ((url.searchParams.get("name")?.length || 0) > 120)
      return json({ error: "ชื่อ Passkey ยาวเกินไป" }, 400);
  }
  let body: {
    response?: Record<string, unknown>;
    name?: string;
    createSession?: boolean;
  } = {};
  if (request.method === "POST") {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16384) {
          await reader.cancel();
          return json({ error: "ข้อมูลยาวเกินไป" }, 413);
        }
        chunks.push(value);
      }
    let input: unknown;
    try {
      input = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
    } catch {
      return json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, 400);
    }
    const parsed = (
      path === "/sign-out" ? signoutSchema : verificationSchema
    ).safeParse(input);
    if (!parsed.success) return json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, 400);
    body = parsed.data;
  }
  // The supported server API retains endpoint validation, hooks and signed cookies,
  // without rebuilding Better Auth's complete HTTP router for every edge request.
  // This boundary owns the HTTP allowlist, origin checks, payload caps and atomic rate limit.
  const api = createAuth(env).api;
  const options = {
    headers: request.headers,
    request,
    asResponse: true as const,
  };
  let response: Response;
  switch (path) {
    case "/get-session":
      response = await api.getSession({
        ...options,
        query: { disableCookieCache: true },
      });
      break;
    case "/passkey/generate-register-options": {
      const query = registrationOptionsSchema.safeParse(
        Object.fromEntries(url.searchParams),
      );
      if (!query.success) return json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, 400);
      response = await api.generatePasskeyRegistrationOptions({
        ...options,
        query: query.data,
      });
      break;
    }
    case "/passkey/generate-authenticate-options":
      response = await api.generatePasskeyAuthenticationOptions(options);
      break;
    case "/passkey/list-user-passkeys":
      response = await api.listPasskeys(options);
      break;
    case "/passkey/verify-registration":
      response = await api.verifyPasskeyRegistration({
        ...options,
        body: { ...body, response: body.response! },
      });
      break;
    case "/passkey/verify-authentication": {
      const assertion = assertionSchema.safeParse(body.response);
      if (!assertion.success)
        return json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, 400);
      response = await api.verifyPasskeyAuthentication({
        ...options,
        body: { response: assertion.data },
      });
      break;
    }
    case "/sign-out":
      response = await api.signOut(options);
      break;
    default:
      return json({ error: "ไม่พบคำขอนี้" }, 404);
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
