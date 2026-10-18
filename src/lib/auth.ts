import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins/username";
import { passkey } from "@better-auth/passkey";
import { APIError, getSessionFromCtx } from "better-auth/api";
import { registerSchema } from "./auth-schema";
function registrationContext(context?: string | null) {
  try {
    return registerSchema.parse(JSON.parse(context || ""));
  } catch {
    throw new APIError("BAD_REQUEST", {
      code: "INVALID_REGISTRATION",
      message: "ตรวจสอบชื่อและชื่อผู้ใช้",
    });
  }
}
const instances = new WeakMap<CloudflareEnv, ReturnType<typeof buildAuth>>();
export function createAuth(env: CloudflareEnv) {
  const existing = instances.get(env);
  if (existing) return existing;
  const auth = buildAuth(env);
  // Reuse configuration only. Sessions and permissions are still read from D1 per request.
  instances.set(env, auth);
  return auth;
}
function buildAuth(env: CloudflareEnv) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32)
    throw new Error("ตั้งค่า BETTER_AUTH_SECRET อย่างน้อย 32 ตัวอักษร");
  const origin = new URL(env.APP_URL).origin;
  return betterAuth({
    appName: "Our Little World",
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: origin,
    basePath: "/api/auth",
    trustedOrigins: [origin],
    emailAndPassword: { enabled: false },
    user: { modelName: "auth_users" },
    session: {
      modelName: "auth_sessions",
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    account: { modelName: "auth_accounts" },
    verification: { modelName: "auth_verifications", storeIdentifier: "plain" },
    advanced: {
      cookiePrefix: "olw",
      useSecureCookies: origin.startsWith("https:"),
      database: {
        generateId: () => crypto.randomUUID(),
      },
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"] },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "auth_rate_limit",
      window: 60,
      max: 60,
      customRules: {
        "/passkey/*": { window: 60, max: 30 },
      },
    },
    plugins: [
      passkey({
        rpID: new URL(origin).hostname,
        rpName: "Our Little World",
        origin,
        schema: { passkey: { modelName: "auth_passkeys" } },
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
        registration: {
          requireSession: false,
          resolveUser: async ({ context, ctx }) => {
            const data = registrationContext(context);
            const existing = await ctx.context.adapter.findOne({
              model: "user",
              where: [{ field: "username", value: data.username }],
            });
            if (existing)
              throw new APIError("BAD_REQUEST", {
                code: "USERNAME_IS_ALREADY_TAKEN",
                message: "ชื่อผู้ใช้นี้ไม่พร้อมใช้งาน กรุณาเลือกชื่ออื่น",
              });
            // Candidate identity is generated here and bound to the server-stored challenge.
            return {
              id: crypto.randomUUID(),
              name: data.username,
              displayName: data.display_name,
            };
          },
          afterVerification: async ({ ctx, verification, user, context }) => {
            if (!verification.registrationInfo?.userVerified)
              throw new APIError("UNAUTHORIZED", {
                message: "ต้องยืนยันตัวตนด้วย PIN หรือลายนิ้วมือ/ใบหน้า",
              });
            const existing = await ctx.context.internalAdapter.findUserById(
              user.id,
            );
            if (existing) {
              const session = await getSessionFromCtx(ctx);
              if (
                session?.user.id !== existing.id ||
                Date.now() - new Date(session.session.createdAt).getTime() >
                  15 * 60000
              )
                throw new APIError("UNAUTHORIZED", {
                  message: "เข้าสู่ระบบอีกครั้งก่อนเพิ่ม Passkey สำรอง",
                });
              return { userId: existing.id };
            }
            const data = registrationContext(context);
            const created = await ctx.context.internalAdapter.createUser(
              {
                name: data.display_name,
                email: data.username + "@accounts.our-little-world.invalid",
                emailVerified: false,
                username: data.username,
              },
              { method: "passkey" },
            );
            return { userId: created.id };
          },
        },
        authentication: {
          afterVerification: async ({ verification }) => {
            // The plugin's verifier permits UP-only assertions by default; our app requires UV.
            if (!verification.authenticationInfo.userVerified)
              throw new APIError("UNAUTHORIZED", {
                message: "ต้องยืนยันตัวตนด้วย PIN หรือลายนิ้วมือ/ใบหน้า",
              });
          },
        },
      }),
      username({
        minUsernameLength: 3,
        maxUsernameLength: 32,
        immutableUsername: true,
        displayUsername: false,
        usernameValidator: (value) => /^[a-z0-9_]{3,32}$/.test(value),
      }),
    ],
  });
}
