import { z } from "zod";
import { browserCodes, pageRoutes, safeErrorRoute } from "./diagnostic-schema";

export class DiagnosticError extends Error {
  constructor(
    message: string,
    public status = 403,
  ) {
    super(message);
  }
}
const browserReport = z
  .object({ route: z.enum(pageRoutes), code: z.enum(browserCodes) })
  .strict();
const dayAt = (at: number) => Math.floor(at / 86400000);
async function coupleFor(env: CloudflareEnv, actor: string) {
  const row = await env.DB.prepare(
    "SELECT couple_id FROM couple_members WHERE user_id=?",
  )
    .bind(actor)
    .first<{ couple_id: string }>();
  return row?.couple_id || null;
}
async function prune(env: CloudflareEnv, now: number) {
  await env.DB.prepare("DELETE FROM diagnostic_events WHERE day<?")
    .bind(dayAt(now) - 13)
    .run();
}
async function record(
  env: CloudflareEnv,
  couple: string | null,
  source: "browser" | "server",
  route: string,
  code: string,
  requestId: string,
) {
  const now = Date.now(),
    day = dayAt(now),
    bucket = couple || "system";
  await prune(env, now);
  // Atomic, indexed limits: at most 20 signals per couple/source/day and 100 globally/source/day.
  // Aggregation and caps prevent browser loops from growing storage or suppressing server errors.
  await env.DB.prepare(
    `INSERT INTO diagnostic_events(day,source,bucket,couple_id,route,code,count,first_at,last_at,last_id,version)
    SELECT ?1,?2,?3,?4,?5,?6,1,?7,?7,?8,?9
    WHERE coalesce((SELECT sum(count) FROM diagnostic_events WHERE day=?1 AND source=?2),0)<100
    AND coalesce((SELECT sum(count) FROM diagnostic_events WHERE day=?1 AND source=?2 AND bucket=?3),0)<20
    ON CONFLICT(day,source,bucket,route,code) DO UPDATE SET count=count+1,last_at=excluded.last_at,last_id=excluded.last_id,version=excluded.version`,
  )
    .bind(
      day,
      source,
      bucket,
      couple,
      route,
      code,
      now,
      requestId,
      env.APP_VERSION?.id || "local",
    )
    .run();
}
export async function reportBrowserError(
  env: CloudflareEnv,
  actor: string,
  input: unknown,
  requestId: string,
) {
  const report = browserReport.parse(input),
    couple = await coupleFor(env, actor);
  if (!couple) throw new DiagnosticError("จับคู่บัญชีก่อนใช้ข้อมูลร่วมกัน");
  await record(env, couple, "browser", report.route, report.code, requestId);
  return { received: true };
}
export async function getDiagnostics(env: CloudflareEnv, actor: string) {
  const couple = await coupleFor(env, actor);
  if (!couple) throw new DiagnosticError("จับคู่บัญชีก่อนใช้ข้อมูลร่วมกัน");
  const now = Date.now();
  await prune(env, now);
  const [rows, totals] = await env.DB.batch<Record<string, unknown>>([
    env.DB.prepare(
      "SELECT source,route,code,count,last_at,last_id,version FROM diagnostic_events WHERE couple_id=? AND day>=? ORDER BY last_at DESC LIMIT 30",
    ).bind(couple, dayAt(now) - 6),
    env.DB.prepare(
      "SELECT coalesce(sum(count),0) AS count FROM diagnostic_events WHERE couple_id=? AND day>=?",
    ).bind(couple, dayAt(now) - 6),
  ]);
  return {
    events: rows.results,
    totalCount: Number(totals.results[0].count),
    days: 7,
  };
}
export async function recordServerError(
  env: CloudflareEnv,
  actor: string | undefined,
  path: string,
  requestId: string,
  entryPoint: "http" | "cron" = "http",
) {
  const route = entryPoint === "cron" ? "scheduled" : safeErrorRoute(path),
    code = entryPoint === "cron" ? "dispatch" : "unexpected";
  // Exception messages and stacks can contain private SQL values and URLs; allowlist every field.
  console.error(
    JSON.stringify({ event: "app_error", entryPoint, requestId, route, code }),
  );
  try {
    await record(
      env,
      actor ? await coupleFor(env, actor) : null,
      "server",
      route,
      code,
      requestId,
    );
  } catch {
    console.error(
      JSON.stringify({
        event: "diagnostic_store_unavailable",
        entryPoint,
        requestId,
      }),
    );
  }
}
