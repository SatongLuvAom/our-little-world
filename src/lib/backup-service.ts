import type {
  D1Database,
  D1PreparedStatement,
} from "@cloudflare/workers-types";
import { z } from "zod";
import { sealedBackupSchema, type SealedBackup } from "./backup-schema";

// Fixed identifiers only. Auth, invitations and global catalogs are never restored.
export const backupTables = {
  quests:
    "id,title,assignee_id,due,repeat,hearts,version,deleted_at,created_at",
  heart_entries:
    "id,kind,actor_id,quest_id,period,reward_id,title,amount,created_at",
  savings_goals: "id,title,target_cents,due,version,created_at",
  savings_entries:
    "id,goal_id,actor_id,contributor_id,kind,amount_cents,reverses_id,note,created_at",
  planned_dates:
    "id,title,place,day,time,budget_cents,version,deleted_at,created_at",
  planned_wishes: "id,title,category,done,version,deleted_at,created_at",
  planned_events: "id,title,day,event_kind,version,deleted_at,created_at",
  memories: "id,author_id,title,day,note,photo,photo_hash,created_at",
  love_letters: "id,author_id,title,body,open_on,created_at",
  daily_moods: "user_id,day,mood,note,version",
  pet_feeds: "id,actor_id,fed_at",
  couple_pets: "name,feeds,last_fed,wearing,version",
  couple_achievements: "achievement_id,unlocked_at",
} as const;
type Table = keyof typeof backupTables;
const tables = Object.keys(backupTables) as Table[];
const pageSize = (table: Table) => (table === "memories" ? 1 : 10);
const manifestSchema = z
  .object({
    version: z.literal(1),
    id: z.uuid(),
    couple: z.uuid(),
    members: z.array(z.uuid()).min(1).max(2),
    anniversary: z.iso.date(),
    revision: z.number().int().nonnegative(),
    catalog: z.string(),
    created_at: z.number().int(),
    counts: z.record(z.string(), z.number().int().nonnegative()),
    hearts: z.number().int().nonnegative(),
    savings_cents: z.number().int().nonnegative(),
  })
  .strict();
type Manifest = z.infer<typeof manifestSchema>;
export class BackupError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
const bytes = (value: string) => Uint8Array.from(Buffer.from(value, "base64"));
const b64 = (value: ArrayBuffer | Uint8Array) =>
  Buffer.from(new Uint8Array(value)).toString("base64");
const encode = (value: string) => new TextEncoder().encode(value);
async function digest(value: string) {
  return b64(await crypto.subtle.digest("SHA-256", encode(value)));
}
async function key(env: CloudflareEnv) {
  // Domain separation prevents using an auth signature or a backup from another deployment.
  const material = await crypto.subtle.digest(
    "SHA-256",
    encode("olw:backup:v1\n" + env.APP_URL + "\n" + env.BETTER_AUTH_SECRET),
  );
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
async function seal(
  env: CloudflareEnv,
  aad: string,
  value: unknown,
): Promise<SealedBackup> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return {
    iv: b64(iv),
    data: b64(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: encode(aad) },
        await key(env),
        encode(JSON.stringify(value)),
      ),
    ),
  };
}
async function unseal(
  env: CloudflareEnv,
  aad: string,
  input: unknown,
): Promise<unknown> {
  const sealed = sealedBackupSchema.parse(input);
  try {
    return JSON.parse(
      new TextDecoder().decode(
        await crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: bytes(sealed.iv),
            additionalData: encode(aad),
          },
          await key(env),
          bytes(sealed.data),
        ),
      ),
    );
  } catch {
    throw new BackupError(
      "ไฟล์เสียหาย ไม่ใช่ของคู่เรา หรือใช้กับเว็บนี้ไม่ได้",
      400,
    );
  }
}
async function scope(db: D1Database, actor: string) {
  const row = await db
    .prepare("SELECT couple_id FROM couple_members WHERE user_id=?")
    .bind(actor)
    .first<{ couple_id: string }>();
  if (!row) throw new BackupError("สร้างคู่หรือรับคำเชิญก่อนสำรองข้อมูล", 403);
  return row.couple_id;
}
async function catalog(db: D1Database) {
  const rows = await db
    .prepare("SELECT id,cost,active,category FROM reward_catalog ORDER BY id")
    .all();
  return digest(JSON.stringify(rows.results));
}
function parts(manifest: Manifest) {
  return tables.flatMap((table) =>
    Array.from(
      { length: Math.ceil(manifest.counts[table] / pageSize(table)) },
      (_, page) => ({ table, offset: page * pageSize(table) }),
    ),
  );
}
function summary(manifest: Manifest) {
  return {
    created_at: manifest.created_at,
    counts: manifest.counts,
    hearts: manifest.hearts,
    savings_cents: manifest.savings_cents,
    parts: parts(manifest).length,
  };
}
async function openManifest(
  env: CloudflareEnv,
  couple: string,
  input: unknown,
) {
  const manifest = manifestSchema.parse(
    await unseal(env, couple + ":manifest", input),
  );
  if (
    manifest.couple !== couple ||
    tables.some((t) => !Number.isSafeInteger(manifest.counts[t])) ||
    Object.keys(manifest.counts).length !== tables.length
  )
    throw new BackupError("ข้อมูลสำรองไม่รองรับ", 400);
  return manifest;
}
export async function startBackup(env: CloudflareEnv, actor: string) {
  const db = env.DB,
    couple = await scope(db, actor);
  await db
    .prepare(
      "DELETE FROM backup_jobs WHERE couple_id=? AND state='staging' AND expires_at<?",
    )
    .bind(couple, Date.now())
    .run();
  const result = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        "SELECT c.anniversary,r.revision,coalesce(w.balance,0) AS hearts,(SELECT coalesce(sum(total_cents),0) FROM savings_balances WHERE couple_id=c.id) AS savings_cents FROM couples c JOIN couple_revisions r ON r.couple_id=c.id LEFT JOIN heart_wallets w ON w.couple_id=c.id WHERE c.id=?",
      )
      .bind(couple),
    db
      .prepare(
        "SELECT user_id FROM couple_members WHERE couple_id=? ORDER BY user_id",
      )
      .bind(couple),
    ...tables.map((table) =>
      db
        .prepare(`SELECT count(*) AS n FROM ${table} WHERE couple_id=?`)
        .bind(couple),
    ),
  ]);
  const row = result[0].results[0],
    counts = Object.fromEntries(
      tables.map((table, i) => [table, Number(result[i + 2].results[0].n)]),
    );
  if (Object.values(counts).reduce((a, b) => a + b, 0) > 20000)
    throw new BackupError(
      "ข้อมูลเกินขนาดสำรองในแอป กรุณาติดต่อผู้ดูแลเพื่อสำรอง D1",
      400,
    );
  const manifest = manifestSchema.parse({
    version: 1,
    id: crypto.randomUUID(),
    couple,
    members: result[1].results.map((m) => m.user_id),
    anniversary: row.anniversary,
    revision: row.revision,
    catalog: await catalog(db),
    created_at: Date.now(),
    counts,
    hearts: row.hearts,
    savings_cents: row.savings_cents,
  });
  return {
    manifest: await seal(env, couple + ":manifest", manifest),
    summary: summary(manifest),
  };
}
export async function exportBackupPart(
  env: CloudflareEnv,
  actor: string,
  input: unknown,
) {
  const data = z
    .object({
      manifest: sealedBackupSchema,
      index: z.number().int().nonnegative().max(2999),
    })
    .strict()
    .parse(input);
  const db = env.DB,
    couple = await scope(db, actor),
    manifest = await openManifest(env, couple, data.manifest),
    part = parts(manifest)[data.index];
  if (!part) throw new BackupError("ไม่พบส่วนของไฟล์", 400);
  const [revision, rows] = await db.batch<Record<string, unknown>>([
    db
      .prepare("SELECT revision FROM couple_revisions WHERE couple_id=?")
      .bind(couple),
    db
      .prepare(
        `SELECT ${backupTables[part.table]} FROM ${part.table} WHERE couple_id=? ORDER BY rowid LIMIT ? OFFSET ?`,
      )
      .bind(couple, pageSize(part.table), part.offset),
  ]);
  if (revision.results[0].revision !== manifest.revision)
    throw new BackupError("ข้อมูลเปลี่ยนระหว่างสำรอง กรุณาเริ่มสำรองใหม่");
  const output = rows.results.map((row) =>
    part.table === "memories"
      ? {
          ...row,
          photo:
            row.photo === null
              ? null
              : Buffer.from(row.photo as number[]).toString("base64"),
        }
      : row,
  );
  return seal(env, couple + ":" + manifest.id + ":" + data.index, output);
}
type Job = {
  id: string;
  couple_id: string;
  manifest: string;
  expected_revision: number;
  part_count: number;
  state: string;
  expires_at: number;
};
async function getJob(env: CloudflareEnv, actor: string, id: string) {
  const couple = await scope(env.DB, actor);
  const job = await env.DB.prepare(
    "SELECT id,couple_id,manifest,expected_revision,part_count,state,expires_at FROM backup_jobs WHERE id=? AND couple_id=?",
  )
    .bind(id, couple)
    .first<Job>();
  if (!job) throw new BackupError("ไม่พบรายการกู้คืน กรุณาเลือกไฟล์ใหม่", 404);
  if (job.state !== "applied" && job.expires_at < Date.now())
    throw new BackupError("รายการกู้คืนหมดเวลา กรุณาเลือกไฟล์ใหม่", 410);
  return job;
}
export async function previewRestore(
  env: CloudflareEnv,
  actor: string,
  input: unknown,
) {
  const data = z.object({ manifest: sealedBackupSchema }).strict().parse(input),
    db = env.DB,
    couple = await scope(db, actor),
    manifest = await openManifest(env, couple, data.manifest);
  const members = await db
    .prepare(
      "SELECT user_id FROM couple_members WHERE couple_id=? ORDER BY user_id",
    )
    .bind(couple)
    .all<{ user_id: string }>();
  if (
    JSON.stringify(members.results.map((m) => m.user_id)) !==
    JSON.stringify(manifest.members)
  )
    throw new BackupError("สมาชิกของคู่เปลี่ยนแล้ว ใช้ไฟล์สำรองนี้ไม่ได้");
  if ((await catalog(db)) !== manifest.catalog)
    throw new BackupError(
      "รายการรางวัลเปลี่ยนแล้ว ไฟล์รุ่นนี้ต้องให้ผู้ดูแลช่วยกู้คืน",
    );
  const id = crypto.randomUUID(),
    partCount = parts(manifest).length;
  await db.batch([
    db.prepare("DELETE FROM backup_jobs WHERE couple_id=?").bind(couple),
    db
      .prepare(
        "INSERT INTO backup_jobs(id,couple_id,manifest,expected_revision,part_count,state,expires_at) SELECT ?,?,?,revision,?,'staging',? FROM couple_revisions WHERE couple_id=?",
      )
      .bind(
        id,
        couple,
        JSON.stringify(manifest),
        partCount,
        Date.now() + 1800000,
        couple,
      ),
  ]);
  return { id, summary: summary(manifest) };
}
export async function uploadRestorePart(
  env: CloudflareEnv,
  actor: string,
  input: unknown,
) {
  const data = z
      .object({
        id: z.uuid(),
        index: z.number().int().nonnegative().max(2999),
        part: sealedBackupSchema,
      })
      .strict()
      .parse(input),
    db = env.DB,
    job = await getJob(env, actor, data.id);
  if (job.state !== "staging")
    throw new BackupError("รายการกู้คืนนี้เสร็จแล้ว");
  const manifest = manifestSchema.parse(JSON.parse(job.manifest)),
    part = parts(manifest)[data.index];
  if (!part) throw new BackupError("ไม่พบส่วนของไฟล์", 400);
  const rows = z
    .array(z.record(z.string(), z.unknown()))
    .max(10)
    .parse(
      await unseal(
        env,
        job.couple_id + ":" + manifest.id + ":" + data.index,
        data.part,
      ),
    );
  if (
    rows.length !==
    Math.min(pageSize(part.table), manifest.counts[part.table] - part.offset)
  )
    throw new BackupError("ไฟล์ไม่ครบ", 400);
  const columns = backupTables[part.table].split(",");
  const prepared = rows.map((row) => {
    if (
      Object.keys(row).length !== columns.length ||
      columns.some((c) => !(c in row))
    )
      throw new BackupError("รูปแบบข้อมูลสำรองไม่รองรับ", 400);
    const photo =
      part.table === "memories" && row.photo !== null
        ? bytes(z.string().max(266668).parse(row.photo))
        : null;
    if (photo && photo.length > 200000)
      throw new BackupError("รูปในไฟล์ใหญ่เกินไป", 400);
    return {
      data: JSON.stringify(photo ? { ...row, photo: null } : row),
      photo,
    };
  });
  const size = prepared.reduce(
    (n, r) => n + encode(r.data).byteLength + (r.photo?.length || 0),
    0,
  );
  await db.batch([
    db
      .prepare(
        "INSERT INTO backup_parts(job_id,part_index,bytes) SELECT ?1,?2,?3 WHERE EXISTS(SELECT 1 FROM backup_jobs WHERE id=?1 AND state='staging' AND expires_at>=?4) AND coalesce((SELECT sum(bytes) FROM backup_parts WHERE job_id=?1),0)+?3<=48000000 ON CONFLICT DO NOTHING",
      )
      .bind(job.id, data.index, size, Date.now()),
    ...prepared.map((r, i) =>
      db
        .prepare(
          "INSERT INTO backup_rows(job_id,part_index,row_index,table_name,data,photo) SELECT ?1,?2,?3,?4,?5,?6 WHERE EXISTS(SELECT 1 FROM backup_parts p JOIN backup_jobs j ON j.id=p.job_id WHERE p.job_id=?1 AND p.part_index=?2 AND j.state='staging') ON CONFLICT DO NOTHING",
        )
        .bind(
          job.id,
          data.index,
          i,
          part.table,
          r.data,
          r.photo ? r.photo.buffer : null,
        ),
    ),
  ]);
  const received = await db
    .prepare("SELECT count(*) AS n FROM backup_parts WHERE job_id=?")
    .bind(job.id)
    .first<{ n: number }>();
  const present = await db
    .prepare("SELECT 1 AS ok FROM backup_parts WHERE job_id=? AND part_index=?")
    .bind(job.id, data.index)
    .first();
  if (!present)
    throw new BackupError("ไฟล์เกินขนาดหรือรายการกู้คืนหมดเวลา", 400);
  return { received: received!.n, total: job.part_count };
}
export async function commitRestore(
  env: CloudflareEnv,
  actor: string,
  input: unknown,
) {
  const data = z
      .object({ id: z.uuid(), confirmation: z.literal("กู้คืนข้อมูล") })
      .strict()
      .parse(input),
    db = env.DB,
    job = await getJob(env, actor, data.id);
  if (job.state === "applied") return { applied: false };
  const manifest = manifestSchema.parse(JSON.parse(job.manifest));
  if ((await catalog(db)) !== manifest.catalog)
    throw new BackupError("รายการรางวัลเปลี่ยนแล้ว กรุณาเลือกไฟล์ใหม่");
  const lock =
    "EXISTS(SELECT 1 FROM backup_jobs WHERE id=?1 AND couple_id=?2 AND state='applying')";
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        "UPDATE backup_jobs SET state='applying' WHERE id=? AND couple_id=? AND state='staging'",
      )
      .bind(job.id, job.couple_id),
  ];
  // A persistent high-water mark also protects records removed by an intermediate restore.
  // Include legacy versions that predate revision tracking; never reuse a previous form version.
  const versionTables = tables.filter((t) =>
    backupTables[t].split(",").includes("version"),
  );
  const currentVersions = versionTables
    .map(
      (table) =>
        `coalesce((SELECT max(version) FROM ${table} WHERE couple_id=?2),0)`,
    )
    .join(",");
  statements.push(
    db
      .prepare(
        `UPDATE couple_revisions SET revision=max(revision,${currentVersions},coalesce((SELECT max(json_extract(data,'$.version')) FROM backup_rows WHERE job_id=?1),0))+1 WHERE couple_id=?2 AND ${lock}`,
      )
      .bind(job.id, job.couple_id),
  );
  statements.push(
    db
      .prepare(
        `UPDATE backup_rows SET data=json_set(data,'$.version',(SELECT revision FROM couple_revisions WHERE couple_id=?2)) WHERE job_id=?1 AND table_name IN (${versionTables.map((table) => "'" + table + "'").join(",")}) AND ${lock}`,
      )
      .bind(job.id, job.couple_id),
  );
  const deletion: string[] = [
    "couple_achievements",
    "pet_feeds",
    "couple_pets",
    "pet_inventory",
    "heart_entries",
    "heart_wallets",
    "savings_entries",
    "savings_balances",
    "savings_goals",
    "quests",
    "planned_dates",
    "planned_wishes",
    "planned_events",
    "daily_moods",
    "love_letters",
    "memories",
  ];
  for (const table of deletion)
    statements.push(
      db
        .prepare(`DELETE FROM ${table} WHERE couple_id=?2 AND ${lock}`)
        .bind(job.id, job.couple_id),
    );
  for (const table of tables.filter(
    (t) => t !== "couple_pets" && t !== "couple_achievements",
  )) {
    const columns = backupTables[table].split(","),
      values = columns
        .map((c) => (c === "photo" ? "photo" : `json_extract(data,'$.${c}')`))
        .join(",");
    statements.push(
      db
        .prepare(
          `INSERT INTO ${table}(couple_id,${columns.join(",")}) SELECT ?2,${values} FROM backup_rows WHERE job_id=?1 AND table_name='${table}' AND ${lock} ORDER BY part_index,row_index`,
        )
        .bind(job.id, job.couple_id),
    );
  }
  // Inventory/wallets are rebuilt by existing ledger triggers. Pet appearance and original badge dates are snapshot data.
  statements.push(
    db
      .prepare(
        `INSERT INTO couple_pets(couple_id,name,feeds,last_fed,wearing,version) SELECT ?2,json_extract(data,'$.name'),json_extract(data,'$.feeds'),json_extract(data,'$.last_fed'),json_extract(data,'$.wearing'),json_extract(data,'$.version') FROM backup_rows WHERE job_id=?1 AND table_name='couple_pets' AND ${lock} ON CONFLICT(couple_id) DO UPDATE SET name=excluded.name,feeds=excluded.feeds,last_fed=excluded.last_fed,wearing=excluded.wearing,version=excluded.version`,
      )
      .bind(job.id, job.couple_id),
  );
  statements.push(
    db
      .prepare(
        `INSERT INTO couple_achievements(couple_id,achievement_id,unlocked_at) SELECT ?2,json_extract(data,'$.achievement_id'),json_extract(data,'$.unlocked_at') FROM backup_rows WHERE job_id=?1 AND table_name='couple_achievements' AND ${lock} ON CONFLICT(couple_id,achievement_id) DO UPDATE SET unlocked_at=excluded.unlocked_at`,
      )
      .bind(job.id, job.couple_id),
  );
  statements.push(
    db
      .prepare(`UPDATE couples SET anniversary=?3 WHERE id=?2 AND ${lock}`)
      .bind(job.id, job.couple_id, manifest.anniversary),
  );
  statements.push(
    db
      .prepare(
        "UPDATE backup_jobs SET state='applied' WHERE id=? AND couple_id=? AND state='applying'",
      )
      .bind(job.id, job.couple_id),
  );
  statements.push(
    db
      .prepare(
        "DELETE FROM backup_parts WHERE job_id=? AND EXISTS(SELECT 1 FROM backup_jobs WHERE id=? AND state='applied')",
      )
      .bind(job.id, job.id),
  );
  try {
    const result = await db.batch(statements);
    return { applied: result[0].meta.changes > 0 };
  } catch (error) {
    if (error instanceof Error && error.message.includes("backup_conflict"))
      throw new BackupError(
        "ข้อมูลเปลี่ยนหลังตรวจไฟล์ กรุณาเลือกไฟล์ใหม่และตรวจอีกครั้ง",
      );
    if (error instanceof Error && error.message.includes("backup_incomplete"))
      throw new BackupError("ไฟล์ยังส่งไม่ครบ กรุณาเลือกไฟล์ใหม่", 400);
    throw error;
  }
}
export async function cancelRestore(
  env: CloudflareEnv,
  actor: string,
  input: unknown,
) {
  const { id } = z.object({ id: z.uuid() }).strict().parse(input),
    couple = await scope(env.DB, actor);
  await env.DB.prepare(
    "DELETE FROM backup_jobs WHERE id=? AND couple_id=? AND state='staging'",
  )
    .bind(id, couple)
    .run();
  return { cancelled: true };
}
