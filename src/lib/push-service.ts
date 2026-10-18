import { z } from "zod";
import {
  allowedPushEndpoint,
  publicPushKey,
  sendWebPush,
  validatePushKeys,
} from "./web-push";
import { questDay } from "./quest-service";

export class PushError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
const flags = { quests: z.boolean(), dates: z.boolean(), letters: z.boolean() };
const subscriptionSchema = z
  .object({
    endpoint: z
      .string()
      .max(2048)
      .refine(allowedPushEndpoint, "ไม่รองรับผู้ให้บริการ Push นี้"),
    expirationTime: z.number().nullable().optional(),
    keys: z
      .object({
        p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}=?$/),
        auth: z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/),
      })
      .strict(),
  })
  .strict();
const saveSchema = z
  .object({
    subscription: subscriptionSchema,
    device: z.string().trim().min(1).max(40),
    ...flags,
  })
  .strict();
const idSchema = z.object({ id: z.uuid() }).strict();
const testSchema = idSchema.extend({ request_id: z.uuid() });
type Subscription = {
  id: string;
  couple_id: string;
  user_id: string;
  endpoint_hash: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  quests: number;
  dates: number;
  letters: number;
};
type Candidate = {
  subscription_id: string;
  event_key: string;
  kind: "quests" | "dates" | "letters" | "test";
};
const keyCache = new WeakMap<CloudflareEnv, JsonWebKey>();
// Better Auth's native D1 adapter persists Date values as ISO text, including in INTEGER-affinity columns.
// Legacy numeric epochs remain valid; malformed dates fail closed. The fractional part preserves millisecond expiry.
const sessionExpiry = `(CASE WHEN typeof(s.expiresAt) IN ('integer','real') THEN s.expiresAt ELSE CAST(strftime('%s',s.expiresAt) AS INTEGER)*1000+CAST(substr(strftime('%f',s.expiresAt),4,3) AS INTEGER) END)`;
const removeExpiredDevices = `DELETE FROM push_subscriptions WHERE NOT EXISTS(SELECT 1 FROM auth_sessions s WHERE s.id=push_subscriptions.session_id AND s.userId=push_subscriptions.user_id AND ${sessionExpiry}>?)`;
function vapid(env: CloudflareEnv) {
  let key = keyCache.get(env);
  if (!key) {
    if (!env.PUSH_VAPID_JWK)
      throw new PushError("ระบบแจ้งเตือนยังไม่พร้อม กรุณาลองใหม่ภายหลัง", 503);
    key = JSON.parse(env.PUSH_VAPID_JWK) as JsonWebKey;
    publicPushKey(key);
    keyCache.set(env, key);
  }
  return key;
}
async function scope(env: CloudflareEnv, actor: string) {
  const row = await env.DB.prepare(
    "SELECT couple_id FROM couple_members WHERE user_id=?",
  )
    .bind(actor)
    .first<{ couple_id: string }>();
  if (!row) throw new PushError("จับคู่บัญชีก่อนเปิดการแจ้งเตือน", 403);
  return row.couple_id;
}
export async function pushState(env: CloudflareEnv, actor: string) {
  const couple = await scope(env, actor);
  const devices = await env.DB.prepare(
    `SELECT p.id,p.endpoint_hash,p.device,p.quests,p.dates,p.letters,p.created_at,p.last_sent_at,p.last_status FROM push_subscriptions p JOIN auth_sessions s ON s.id=p.session_id AND s.userId=p.user_id WHERE p.user_id=? AND p.couple_id=? AND ${sessionExpiry}>? ORDER BY p.created_at LIMIT 3`,
  )
    .bind(actor, couple, Date.now())
    .all();
  return {
    configured: !!env.PUSH_VAPID_JWK,
    publicKey: env.PUSH_VAPID_JWK ? publicPushKey(vapid(env)) : null,
    devices: devices.results,
  };
}
export async function subscribePush(
  env: CloudflareEnv,
  actor: string,
  session: string,
  input: unknown,
) {
  const data = saveSchema.parse(input),
    couple = await scope(env, actor),
    now = Date.now();
  vapid(env);
  try {
    await validatePushKeys(
      data.subscription.keys.p256dh,
      data.subscription.keys.auth,
    );
  } catch {
    throw new PushError("รหัสรับการแจ้งเตือนไม่ถูกต้อง กรุณาลองเปิดใหม่", 400);
  }
  const hash = Buffer.from(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(data.subscription.endpoint),
    ),
  ).toString("hex");
  // Expired sessions cannot retain a device slot or receive future private notifications.
  await env.DB.prepare(removeExpiredDevices).bind(now).run();
  try {
    const saved = await env.DB.prepare(
      `INSERT INTO push_subscriptions(id,couple_id,user_id,session_id,endpoint_hash,endpoint,p256dh,auth,device,quests,dates,letters,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(endpoint_hash) DO UPDATE SET session_id=excluded.session_id,p256dh=excluded.p256dh,auth=excluded.auth,device=excluded.device,quests=excluded.quests,dates=excluded.dates,letters=excluded.letters
      WHERE push_subscriptions.user_id=excluded.user_id AND push_subscriptions.couple_id=excluded.couple_id RETURNING id`,
    )
      .bind(
        crypto.randomUUID(),
        couple,
        actor,
        session,
        hash,
        data.subscription.endpoint,
        data.subscription.keys.p256dh,
        data.subscription.keys.auth,
        data.device,
        +data.quests,
        +data.dates,
        +data.letters,
        now,
      )
      .all<{ id: string }>();
    if (!saved.results.length)
      throw new PushError(
        "เครื่องนี้ผูกกับบัญชีอื่น กรุณาออกจากระบบบัญชีเดิมก่อน",
      );
    return { id: saved.results[0].id };
  } catch (error) {
    if (error instanceof Error && error.message.includes("push_device_limit"))
      throw new PushError(
        "เปิดได้สูงสุด 3 เครื่องต่อคน กรุณาปิดเครื่องเดิมก่อน หรือรอพื้นที่แจ้งเตือนว่าง",
      );
    throw error;
  }
}
export async function unsubscribePush(
  env: CloudflareEnv,
  actor: string,
  input: unknown,
) {
  const { id } = idSchema.parse(input),
    couple = await scope(env, actor);
  await env.DB.prepare(
    "DELETE FROM push_subscriptions WHERE id=? AND user_id=? AND couple_id=?",
  )
    .bind(id, actor, couple)
    .run();
  return { removed: true };
}

async function deliver(
  env: CloudflareEnv,
  sub: Subscription,
  candidate: Candidate,
  now: number,
  transport: typeof fetch,
) {
  const db = env.DB,
    id = crypto.randomUUID();
  const receipt = await db
    .prepare(
      `INSERT INTO push_deliveries(id,couple_id,user_id,endpoint_hash,event_key,state,created_at)
    SELECT ?,?,?,?,?, 'sending',? WHERE EXISTS(SELECT 1 FROM push_subscriptions p JOIN auth_sessions s ON s.id=p.session_id AND s.userId=p.user_id WHERE p.id=? AND ${sessionExpiry}>? AND p.auth=? AND p.p256dh=? AND ${candidate.kind === "test" ? "1=1" : "p." + candidate.kind + "=1"})
    ON CONFLICT(user_id,endpoint_hash,event_key) DO UPDATE SET state='sending',attempts=push_deliveries.attempts+1
    WHERE push_deliveries.state='retry' AND push_deliveries.next_attempt_at<=excluded.created_at AND push_deliveries.attempts<3 RETURNING id,attempts`,
    )
    .bind(
      id,
      sub.couple_id,
      sub.user_id,
      sub.endpoint_hash,
      candidate.event_key,
      now,
      sub.id,
      now,
      sub.auth,
      sub.p256dh,
    )
    .first<{ id: string; attempts: number }>();
  if (!receipt) return "skipped";
  // No private titles, content, names, amounts or source IDs leave the app in a lock-screen payload.
  const payload = JSON.stringify({ kind: candidate.kind, tag: receipt.id });
  let status = 0,
    state = "uncertain",
    retryAt = 0;
  try {
    const response = await sendWebPush(
      vapid(env),
      new URL(env.APP_URL).origin,
      sub,
      payload,
      transport,
      now,
    );
    status = response.status;
    await response.body?.cancel();
    if (status >= 200 && status < 300) state = "sent";
    else if ((status === 429 || status >= 500) && receipt.attempts < 3) {
      state = "retry";
      const after = response.headers.get("Retry-After");
      const delay =
        after && /^\d+$/.test(after)
          ? Number(after) * 1000
          : after
            ? Date.parse(after) - now
            : 0;
      if (Number.isFinite(delay) && delay > 86400000) state = "failed";
      else
        retryAt =
          now +
          Math.max(
            900000,
            Number.isFinite(delay) && delay > 0
              ? delay
              : 900000 * receipt.attempts,
          );
    } else state = "failed";
  } catch {
    // The push service may have accepted a timed-out request. Never resend an unknown outcome.
  }
  await db.batch([
    db
      .prepare(
        "UPDATE push_deliveries SET state=?,status=?,next_attempt_at=? WHERE id=?",
      )
      .bind(state, status, retryAt, receipt.id),
    db
      .prepare(
        "UPDATE push_subscriptions SET last_status=?,last_sent_at=CASE WHEN ?='sent' THEN ? ELSE last_sent_at END WHERE id=?",
      )
      .bind(status, state, now, sub.id),
    ...(status === 404 || status === 410
      ? [db.prepare("DELETE FROM push_subscriptions WHERE id=?").bind(sub.id)]
      : []),
  ]);
  return state;
}
export async function testPush(
  env: CloudflareEnv,
  actor: string,
  input: unknown,
  transport: typeof fetch = fetch,
) {
  const { id, request_id } = testSchema.parse(input),
    couple = await scope(env, actor),
    now = Date.now();
  const sub = await env.DB.prepare(
    `SELECT p.* FROM push_subscriptions p JOIN auth_sessions s ON s.id=p.session_id AND s.userId=p.user_id WHERE p.id=? AND p.user_id=? AND p.couple_id=? AND ${sessionExpiry}>?`,
  )
    .bind(id, actor, couple, now)
    .first<Subscription>();
  if (!sub)
    throw new PushError("ไม่พบเครื่องที่รับแจ้งเตือน กรุณาเปิดใหม่", 404);
  const key = "test:" + request_id;
  const old = await env.DB.prepare(
    "SELECT state FROM push_deliveries WHERE user_id=? AND endpoint_hash=? AND event_key=?",
  )
    .bind(actor, sub.endpoint_hash, key)
    .first<{ state: string }>();
  if (old) return { state: old.state, applied: false };
  const allowed = await env.DB.prepare(
    "UPDATE push_subscriptions SET last_test_at=? WHERE id=? AND last_test_at<=? RETURNING id",
  )
    .bind(now, id, now - 60000)
    .first();
  if (!allowed) throw new PushError("รอ 1 นาทีก่อนทดสอบอีกครั้ง", 429);
  return {
    state: await deliver(
      env,
      sub,
      { subscription_id: id, event_key: key, kind: "test" },
      now,
      transport,
    ),
    applied: true,
  };
}

export async function dispatchPush(
  env: CloudflareEnv,
  now = Date.now(),
  transport: typeof fetch = fetch,
) {
  if (!env.PUSH_VAPID_JWK) return { configured: false, sent: 0 };
  vapid(env);
  const db = env.DB,
    day = questDay(now),
    previousDay = questDay(now - 86400000);
  const week = new Date(day + "T12:00:00Z");
  week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));
  await db.batch([
    db.prepare(removeExpiredDevices).bind(now),
    db
      .prepare(
        "DELETE FROM push_deliveries WHERE id IN (SELECT id FROM push_deliveries WHERE created_at<? LIMIT 100)",
      )
      .bind(now - 30 * 86400000),
  ]);
  // Bounded round-robin: at most four devices and eight sends per invocation on the existing Free DO.
  const devices = (
    await db
      .prepare(
        `SELECT p.* FROM push_subscriptions p JOIN auth_sessions s ON s.id=p.session_id AND s.userId=p.user_id WHERE ${sessionExpiry}>? ORDER BY p.checked_at,p.id LIMIT 4`,
      )
      .bind(now)
      .all<Subscription>()
  ).results;
  if (!devices.length) return { configured: true, sent: 0 };
  const ids = devices.map((d) => d.id),
    placeholders = ids.map(() => "?").join(",");
  const eligible = `NOT EXISTS(SELECT 1 FROM push_deliveries x WHERE x.user_id=p.user_id AND x.endpoint_hash=p.endpoint_hash AND x.event_key=event_key_value AND (x.state<>'retry' OR x.next_attempt_at>${now} OR x.attempts>=3))`;
  const localHour = new Date(now + 7 * 3600000).getUTCHours();
  const results = await db.batch<Candidate>([
    db
      .prepare(
        `WITH candidates AS (SELECT p.id AS subscription_id,'quests:'||? AS event_key_value,'quests' AS kind,p.user_id,p.endpoint_hash FROM push_subscriptions p JOIN quests q ON q.couple_id=p.couple_id
      WHERE p.id IN (${placeholders}) AND p.quests=1 AND ?=9 AND q.deleted_at IS NULL AND q.due<=? AND (q.assignee_id IS NULL OR q.assignee_id=p.user_id)
      AND NOT EXISTS(SELECT 1 FROM heart_entries h WHERE h.couple_id=q.couple_id AND h.quest_id=q.id AND h.kind='completion' AND h.period=CASE q.repeat WHEN 'ครั้งเดียว' THEN 'once' WHEN 'รายวัน' THEN ? ELSE ? END) GROUP BY p.id)
      SELECT p.subscription_id,p.event_key_value AS event_key,p.kind FROM candidates p WHERE ${eligible} LIMIT 8`,
      )
      .bind(day, ...ids, localHour, day, day, week.toISOString().slice(0, 10)),
    db
      .prepare(
        `WITH candidates AS (SELECT p.id AS subscription_id,'date:'||d.id||':'||d.day||':'||d.time AS event_key_value,'dates' AS kind,p.user_id,p.endpoint_hash FROM push_subscriptions p JOIN planned_dates d ON d.couple_id=p.couple_id
      WHERE p.id IN (${placeholders}) AND p.dates=1 AND d.deleted_at IS NULL AND d.day BETWEEN ? AND ? AND d.day||'T'||d.time||':00'>=? AND d.day||'T'||d.time||':00'<=?)
      SELECT p.subscription_id,p.event_key_value AS event_key,p.kind FROM candidates p WHERE ${eligible} ORDER BY p.event_key_value LIMIT 8`,
      )
      .bind(
        ...ids,
        day,
        questDay(now + 1800000),
        new Date(now + 7 * 3600000).toISOString().slice(0, 19),
        new Date(now + 7 * 3600000 + 1800000).toISOString().slice(0, 19),
      ),
    db
      .prepare(
        `WITH candidates AS (SELECT p.id AS subscription_id,'letter:'||l.id AS event_key_value,'letters' AS kind,p.user_id,p.endpoint_hash FROM push_subscriptions p JOIN love_letters l ON l.couple_id=p.couple_id
      WHERE p.id IN (${placeholders}) AND p.letters=1 AND l.author_id<>p.user_id AND l.open_on<=? AND (l.open_on>=? OR l.created_at>=?))
      SELECT p.subscription_id,p.event_key_value AS event_key,p.kind FROM candidates p WHERE ${eligible} ORDER BY p.event_key_value LIMIT 8`,
      )
      .bind(...ids, day, previousDay, now - 86400000),
  ]);
  const counts: Record<string, number> = {
    sent: 0,
    skipped: 0,
    failed: 0,
    uncertain: 0,
    retry: 0,
  };
  for (const candidate of results.flatMap((r) => r.results).slice(0, 8)) {
    const sub = devices.find((d) => d.id === candidate.subscription_id)!;
    counts[await deliver(env, sub, candidate, now, transport)]++;
  }
  await db
    .prepare(
      `UPDATE push_subscriptions SET checked_at=? WHERE id IN (${placeholders})`,
    )
    .bind(now, ...ids)
    .run();
  return { configured: true, ...counts };
}
