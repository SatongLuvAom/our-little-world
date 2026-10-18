import type { D1Database } from "@cloudflare/workers-types";
import { inflateSync } from "node:zlib";
import { z } from "zod";
import {
  journalDeleteSchema,
  journalSaveSchema,
  journalStateSchema,
} from "./journal-schema";
import { questDay } from "./quest-service";
export class JournalError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
async function scope(db: D1Database, actor: string) {
  const row = await db
    .prepare("SELECT couple_id FROM couple_members WHERE user_id = ?")
    .bind(actor)
    .first<{ couple_id: string }>();
  if (!row)
    throw new JournalError("สร้างคู่หรือรับคำเชิญก่อนใช้ข้อมูลร่วมกัน", 403);
  return row.couple_id;
}
// Accept only bounded, non-interlaced RGB/RGBA PNGs without metadata or trailing payloads.
// The client re-encodes through canvas; validate the actual compressed raster again here.
export function validatePhoto(photo: string): Uint8Array | null {
  if (!photo) return null;
  const prefix = "data:image/png;base64,";
  if (
    !photo.startsWith(prefix) ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(photo.slice(prefix.length))
  )
    throw new JournalError("รูปต้องเป็น PNG ที่ผ่านการย่อแล้ว", 400);
  const bytes = Buffer.from(photo.slice(prefix.length), "base64");
  if (
    bytes.length > 200000 ||
    bytes.length < 57 ||
    bytes.toString("base64") !== photo.slice(prefix.length) ||
    bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
  )
    throw new JournalError("รูปไม่ถูกต้องหรือเกิน 200 KB", 400);
  let offset = 8,
    width = 0,
    height = 0,
    channels = 0,
    ended = false;
  const chunks: Buffer[] = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length)
      throw new JournalError("ไฟล์รูปไม่สมบูรณ์", 400);
    const size = bytes.readUInt32BE(offset),
      type = bytes.toString("latin1", offset + 4, offset + 8),
      end = offset + 12 + size;
    if (end > bytes.length || ended)
      throw new JournalError("ไฟล์รูปไม่สมบูรณ์", 400);
    let crc = 0xffffffff;
    for (let i = offset + 4; i < end - 4; i++) {
      crc ^= bytes[i];
      for (let b = 0; b < 8; b++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    if ((crc ^ 0xffffffff) >>> 0 !== bytes.readUInt32BE(end - 4))
      throw new JournalError("รูปเสียหาย", 400);
    if (type === "IHDR" && offset === 8 && size === 13) {
      width = bytes.readUInt32BE(offset + 8);
      height = bytes.readUInt32BE(offset + 12);
      channels =
        bytes[offset + 17] === 6 ? 4 : bytes[offset + 17] === 2 ? 3 : 0;
      if (
        !width ||
        !height ||
        width > 1024 ||
        height > 1024 ||
        !channels ||
        bytes[offset + 16] !== 8 ||
        bytes[offset + 18] !== 0 ||
        bytes[offset + 19] !== 0 ||
        bytes[offset + 20] !== 0
      )
        throw new JournalError("ขนาดหรือรูปแบบรูปไม่รองรับ", 400);
    } else if (type === "IDAT" && width)
      chunks.push(bytes.subarray(offset + 8, end - 4));
    else if (type === "IEND" && size === 0 && chunks.length) {
      ended = true;
    } else
      throw new JournalError(
        "รูปมีข้อมูลที่ไม่รองรับ กรุณาเลือกผ่านหน้าสมุดความทรงจำ",
        400,
      );
    offset = end;
  }
  if (!ended) throw new JournalError("ไฟล์รูปไม่สมบูรณ์", 400);
  const expected = (width * channels + 1) * height;
  let raster: Buffer;
  try {
    const inflated = inflateSync(Buffer.concat(chunks), {
      maxOutputLength: expected,
      info: true,
    }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
    if (
      inflated.engine.bytesWritten !== chunks.reduce((s, c) => s + c.length, 0)
    )
      throw Error("Trailing data");
    raster = inflated.buffer;
  } catch {
    throw new JournalError("ข้อมูลภาพไม่ถูกต้อง", 400);
  }
  if (raster.length !== expected)
    throw new JournalError("ข้อมูลภาพไม่ถูกต้อง", 400);
  for (let y = 0; y < height; y++)
    if (raster[y * (width * channels + 1)] > 4)
      throw new JournalError("ข้อมูลภาพไม่ถูกต้อง", 400);
  return bytes;
}
export async function saveJournal(
  db: D1Database,
  actor: string,
  input: unknown,
) {
  const data = journalSaveSchema.parse(input),
    couple = await scope(db, actor);
  if (data.kind === "mood") {
    if (data.day !== questDay())
      throw new JournalError("วันเปลี่ยนแล้ว กรุณาโหลดล่าสุด");
    const current = await db
      .prepare(
        "SELECT mood,note FROM daily_moods WHERE couple_id=? AND user_id=? AND day=?",
      )
      .bind(couple, actor, data.day)
      .first();
    if (current?.mood === data.mood && current.note === data.note)
      return { applied: false };
    const result =
      data.version === 0
        ? await db
            .prepare(
              "INSERT INTO daily_moods(couple_id,user_id,day,mood,note) VALUES (?,?,?,?,?) ON CONFLICT(couple_id,user_id,day) DO NOTHING RETURNING version",
            )
            .bind(couple, actor, data.day, data.mood, data.note)
            .all()
        : await db
            .prepare(
              "UPDATE daily_moods SET mood=?,note=?,version=version+1 WHERE couple_id=? AND user_id=? AND day=? AND version=? RETURNING version",
            )
            .bind(data.mood, data.note, couple, actor, data.day, data.version)
            .all();
    if (result.results.length) return { applied: true };
    throw new JournalError("ความรู้สึกเปลี่ยนแล้ว กรุณาโหลดล่าสุด");
  }
  if (data.kind === "letter") {
    if (data.openOn < questDay())
      throw new JournalError("เลือกวันนี้หรือวันข้างหน้า", 400);
    const result = await db
      .prepare(
        "INSERT INTO love_letters(id,couple_id,author_id,title,body,open_on,created_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT count(*) FROM love_letters WHERE couple_id=?)<100 ON CONFLICT(id) DO NOTHING RETURNING id",
      )
      .bind(
        data.id,
        couple,
        actor,
        data.title,
        data.body,
        data.openOn,
        Date.now(),
        couple,
      )
      .all();
    if (result.results.length) return { applied: true };
    const row = await db
      .prepare(
        "SELECT title,body,open_on,author_id FROM love_letters WHERE couple_id=? AND id=?",
      )
      .bind(couple, data.id)
      .first();
    if (
      row?.author_id === actor &&
      row.title === data.title &&
      row.body === data.body &&
      row.open_on === data.openOn
    )
      return { applied: false };
  } else {
    const bytes = validatePhoto(data.photo),
      hash = bytes
        ? Buffer.from(
            await crypto.subtle.digest(
              "SHA-256",
              bytes as Uint8Array<ArrayBuffer>,
            ),
          ).toString("hex")
        : "";
    const result = await db
      .prepare(
        "INSERT INTO memories(id,couple_id,author_id,title,day,note,photo,photo_hash,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM memories WHERE couple_id=?)<100 ON CONFLICT(id) DO NOTHING RETURNING id",
      )
      .bind(
        data.id,
        couple,
        actor,
        data.title,
        data.day,
        data.note,
        bytes ? Array.from(bytes) : null,
        hash,
        Date.now(),
        couple,
      )
      .all();
    if (result.results.length) return { applied: true };
    const row = await db
      .prepare(
        "SELECT title,day,note,photo_hash,author_id FROM memories WHERE couple_id=? AND id=?",
      )
      .bind(couple, data.id)
      .first();
    if (
      row?.author_id === actor &&
      row.title === data.title &&
      row.day === data.day &&
      row.note === data.note &&
      row.photo_hash === hash
    )
      return { applied: false };
  }
  throw new JournalError("รายการเปลี่ยนแล้วหรือครบ 100 รายการ กรุณาโหลดล่าสุด");
}
export async function deleteJournal(
  db: D1Database,
  actor: string,
  input: unknown,
) {
  const data = journalDeleteSchema.parse(input),
    couple = await scope(db, actor),
    table = data.kind === "memory" ? "memories" : "love_letters";
  const row = await db
    .prepare(
      `DELETE FROM ${table} WHERE couple_id=? AND id=? AND author_id=? RETURNING id`,
    )
    .bind(couple, data.id, actor)
    .first();
  if (!row) throw new JournalError("ไม่พบรายการของคุณ", 404);
  return { applied: true };
}
async function signingKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
const signedPayload = (
  id: string,
  actor: string,
  session: string,
  expires: number,
) =>
  new TextEncoder().encode(
    JSON.stringify(["olw-private-photo-v1", id, actor, session, expires]),
  );
export async function getJournalState(
  env: CloudflareEnv,
  actor: string,
  session: string,
) {
  const couple = await scope(env.DB, actor),
    day = questDay(),
    expires = Math.floor(Date.now() / 1000) + 90;
  const [memories, letters, moods] = await env.DB.batch<
    Record<string, unknown>
  >([
    env.DB.prepare(
      "SELECT id,author_id,title,day,note,photo IS NOT NULL AS has_photo FROM memories WHERE couple_id=? ORDER BY day DESC,id DESC LIMIT 100",
    ).bind(couple),
    env.DB.prepare(
      "SELECT id,author_id,title,open_on AS openOn FROM love_letters WHERE couple_id=? ORDER BY created_at DESC,id DESC LIMIT 100",
    ).bind(couple),
    env.DB.prepare(
      "SELECT user_id,day,mood,note,version FROM daily_moods WHERE couple_id=? ORDER BY day DESC,user_id LIMIT 60",
    ).bind(couple),
  ]);
  const key = await signingKey(env.BETTER_AUTH_SECRET);
  return journalStateSchema.parse({
    day,
    memories: await Promise.all(
      memories.results.map(async (row) => ({
        ...row,
        photo: row.has_photo
          ? `/api/journal/photo?id=${row.id}&expires=${expires}&signature=${Buffer.from(await crypto.subtle.sign("HMAC", key, signedPayload(String(row.id), actor, session, expires))).toString("hex")}`
          : "",
      })),
    ),
    letters: letters.results.map((row) => ({
      ...row,
      locked: String(row.openOn) > day,
    })),
    moods: moods.results,
  });
}
export async function readLetter(db: D1Database, actor: string, id: string) {
  z.uuid().parse(id);
  const couple = await scope(db, actor);
  // The body is never selected until the server's Thai calendar reaches the opening date.
  const row = await db
    .prepare(
      "SELECT body FROM love_letters WHERE couple_id=? AND id=? AND open_on<=?",
    )
    .bind(couple, id, questDay())
    .first<{ body: string }>();
  if (!row) throw new JournalError("ยังไม่ถึงวันเปิดหรือไม่พบจดหมาย", 404);
  return row;
}
export async function readPhoto(
  env: CloudflareEnv,
  actor: string,
  session: string,
  url: URL,
) {
  const id = z.uuid().parse(url.searchParams.get("id")),
    expires = z.coerce.number().int().parse(url.searchParams.get("expires")),
    signature = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(url.searchParams.get("signature"));
  const now = Math.floor(Date.now() / 1000);
  if (
    expires <= now ||
    expires > now + 90 ||
    !(await crypto.subtle.verify(
      "HMAC",
      await signingKey(env.BETTER_AUTH_SECRET),
      Buffer.from(signature, "hex"),
      signedPayload(id, actor, session, expires),
    ))
  )
    throw new JournalError("ลิงก์รูปหมดอายุ กรุณาโหลดล่าสุด", 403);
  const couple = await scope(env.DB, actor),
    row = await env.DB.prepare(
      "SELECT photo FROM memories WHERE couple_id=? AND id=? AND photo IS NOT NULL",
    )
      .bind(couple, id)
      .first<{ photo: number[] }>();
  if (!row) throw new JournalError("ไม่พบรูปนี้", 404);
  return new Response(new Uint8Array(row.photo), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": "inline; filename=memory.png",
    },
  });
}
