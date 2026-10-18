import type { D1Database } from "@cloudflare/workers-types";
import { z } from "zod";
import {
  completeQuestSchema,
  deleteQuestSchema,
  heartHistorySchema,
  questStateSchema,
  redeemRewardSchema,
  saveQuestSchema,
} from "./quest-schema";

export class QuestError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
// The server clock determines periods; callers cannot choose a day or a time zone.
export function questDay(at = Date.now()) {
  return new Date(at + 7 * 3600000).toISOString().slice(0, 10);
}
function weekStart(day: string) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
async function scope(db: D1Database, actor: string) {
  z.uuid().parse(actor);
  const row = await db
    .prepare("SELECT couple_id FROM couple_members WHERE user_id = ?")
    .bind(actor)
    .first<{ couple_id: string }>();
  if (!row)
    throw new QuestError("สร้างคู่หรือรับคำเชิญก่อนใช้ภารกิจร่วมกัน", 403);
  return row.couple_id;
}
const entryColumns =
  "id,kind,actor_id,quest_id,period,reward_id,title,amount,created_at,coalesce((SELECT category FROM reward_catalog r WHERE r.id=heart_entries.reward_id),'reward') AS category";
function historyStatement(db: D1Database, couple: string, before?: string) {
  return before
    ? db
        .prepare(
          `SELECT ${entryColumns} FROM heart_entries WHERE couple_id = ? AND (created_at,id) < (SELECT created_at,id FROM heart_entries WHERE couple_id = ? AND id = ?) ORDER BY created_at DESC,id DESC LIMIT 31`,
        )
        .bind(couple, couple, before)
    : db
        .prepare(
          `SELECT ${entryColumns} FROM heart_entries WHERE couple_id = ? ORDER BY created_at DESC,id DESC LIMIT 31`,
        )
        .bind(couple);
}
function historyPage(rows: unknown[]) {
  const entries = heartHistorySchema.shape.entries.parse(rows.slice(0, 30));
  return { entries, nextCursor: rows.length > 30 ? entries.at(-1)!.id : null };
}
export async function getQuestHistory(
  db: D1Database,
  actor: string,
  before: string,
) {
  z.uuid().parse(before);
  const couple = await scope(db, actor);
  return historyPage(
    (await historyStatement(db, couple, before).all()).results,
  );
}
export async function getQuestState(db: D1Database, actor: string) {
  const couple = await scope(db, actor),
    day = questDay();
  const [coupleRow, members, quests, catalog, wallet, history] = await db.batch<
    Record<string, unknown>
  >([
    db.prepare("SELECT id,anniversary FROM couples WHERE id = ?").bind(couple),
    db
      .prepare(
        "SELECT u.id,u.name FROM auth_users u JOIN couple_members m ON m.user_id = u.id WHERE m.couple_id = ? ORDER BY m.joined_at,m.user_id",
      )
      .bind(couple),
    db
      .prepare(
        `SELECT q.id,q.title,q.assignee_id,q.due,q.repeat,q.hearts,q.version,EXISTS(SELECT 1 FROM heart_entries h WHERE h.couple_id = q.couple_id AND h.quest_id = q.id AND h.kind = 'completion' AND h.period = CASE q.repeat WHEN 'ครั้งเดียว' THEN 'once' WHEN 'รายวัน' THEN ? ELSE ? END) AS done FROM quests q WHERE q.couple_id = ? AND q.deleted_at IS NULL ORDER BY q.created_at DESC,q.id DESC LIMIT 200`,
      )
      .bind(day, weekStart(day), couple),
    db.prepare(
      "SELECT id,title,detail,icon,cost FROM reward_catalog WHERE active = 1 AND category='reward' ORDER BY rowid",
    ),
    db
      .prepare(
        "SELECT coalesce((SELECT balance FROM heart_wallets WHERE couple_id = ?1),0) AS balance,coalesce((SELECT completion_count FROM heart_wallets WHERE couple_id = ?1),0) AS completionCount,(SELECT count(*) FROM heart_entries WHERE couple_id = ?1 AND kind = 'completion' AND created_at >= ?2 AND created_at < ?3) AS todayCompletionCount",
      )
      .bind(
        couple,
        Date.parse(day + "T00:00:00+07:00"),
        Date.parse(day + "T00:00:00+07:00") + 86400000,
      ),
    historyStatement(db, couple),
  ]);
  return questStateSchema.parse({
    actor_id: actor,
    couple: { ...coupleRow.results[0], members: members.results },
    day,
    quests: quests.results.map((q) => ({ ...q, done: Boolean(q.done) })),
    rewards: catalog.results,
    ...wallet.results[0],
    history: historyPage(history.results),
  });
}
export async function saveQuest(db: D1Database, actor: string, input: unknown) {
  const q = saveQuestSchema.parse(input),
    couple = await scope(db, actor);
  if (
    q.assignee_id &&
    !(await db
      .prepare(
        "SELECT 1 FROM couple_members WHERE couple_id = ? AND user_id = ?",
      )
      .bind(couple, q.assignee_id)
      .first())
  )
    throw new QuestError("ผู้รับผิดชอบต้องเป็นสมาชิกคู่ของเรา", 400);
  const result =
    q.version === 0
      ? await db
          .prepare(
            "INSERT INTO quests(id,couple_id,title,assignee_id,due,repeat,hearts,created_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM quests WHERE couple_id = ? AND deleted_at IS NULL) < 200 ON CONFLICT(id) DO NOTHING RETURNING id",
          )
          .bind(
            q.id,
            couple,
            q.title,
            q.assignee_id,
            q.due,
            q.repeat,
            q.hearts,
            Date.now(),
            couple,
          )
          .all()
      : await db
          .prepare(
            "UPDATE quests SET title = ?,assignee_id = ?,due = ?,repeat = ?,hearts = ?,version = version + 1 WHERE id = ? AND couple_id = ? AND version = ? AND deleted_at IS NULL AND (repeat = ? OR NOT EXISTS(SELECT 1 FROM heart_entries WHERE couple_id = ? AND quest_id = ?)) RETURNING id",
          )
          .bind(
            q.title,
            q.assignee_id,
            q.due,
            q.repeat,
            q.hearts,
            q.id,
            couple,
            q.version,
            q.repeat,
            couple,
            q.id,
          )
          .all();
  if (result.results.length) return;
  // An uncertain create can safely retry its original ID, without reviving a deleted quest.
  if (q.version === 0) {
    const existing = await db
      .prepare(
        "SELECT title,assignee_id,due,repeat,hearts FROM quests WHERE id = ? AND couple_id = ? AND deleted_at IS NULL",
      )
      .bind(q.id, couple)
      .first();
    if (
      existing &&
      ["title", "assignee_id", "due", "repeat", "hearts"].every(
        (k) => existing[k] === q[k as keyof typeof q],
      )
    )
      return;
  }
  throw new QuestError(
    "บันทึกไม่ได้: ข้อมูลเปลี่ยนแล้ว, มีครบ 200 ภารกิจ หรือเปลี่ยนรอบหลังรับหัวใจแล้ว กรุณาโหลดข้อมูลใหม่",
  );
}
export async function deleteQuest(
  db: D1Database,
  actor: string,
  input: unknown,
) {
  const { id } = deleteQuestSchema.parse(input),
    couple = await scope(db, actor);
  const row = await db
    .prepare(
      "UPDATE quests SET deleted_at = coalesce(deleted_at,?),version = version + (deleted_at IS NULL) WHERE id = ? AND couple_id = ? RETURNING id",
    )
    .bind(Date.now(), id, couple)
    .first();
  if (!row) throw new QuestError("ไม่พบภารกิจนี้", 404);
}
export async function completeQuest(
  db: D1Database,
  actor: string,
  input: unknown,
) {
  const { id, request_id } = completeQuestSchema.parse(input),
    couple = await scope(db, actor);
  const at = Date.now(),
    day = questDay(at);
  const [insert, existing] = await db.batch<Record<string, unknown>>([
    // This single INSERT reads the current quest and writes its award, inside the same transaction.
    db
      .prepare(
        `INSERT INTO heart_entries(couple_id,id,kind,actor_id,quest_id,period,title,amount,created_at) SELECT q.couple_id,?,'completion',?,q.id,CASE q.repeat WHEN 'ครั้งเดียว' THEN 'once' WHEN 'รายวัน' THEN ? ELSE ? END,q.title,q.hearts,? FROM quests q WHERE q.couple_id = ? AND q.id = ? AND q.deleted_at IS NULL AND q.due <= ? AND (q.assignee_id IS NULL OR q.assignee_id = ?) ON CONFLICT DO NOTHING RETURNING id`,
      )
      .bind(request_id, actor, day, weekStart(day), at, couple, id, day, actor),
    db
      .prepare(
        `SELECT kind,quest_id,period,reward_id FROM heart_entries WHERE couple_id = ? AND id = ?`,
      )
      .bind(couple, request_id),
  ]);
  const replay = existing.results[0];
  if (replay) {
    if (replay.kind !== "completion" || replay.quest_id !== id)
      throw new QuestError("รหัสคำขอนี้ใช้กับรายการอื่นแล้ว");
    return { applied: insert.results.length > 0 };
  }
  // A different request ID for an already completed period also earns nothing.
  const done = await db
    .prepare(
      `SELECT 1 FROM quests q JOIN heart_entries h ON h.couple_id = q.couple_id AND h.quest_id = q.id AND h.kind = 'completion' WHERE q.couple_id = ? AND q.id = ? AND h.period = CASE q.repeat WHEN 'ครั้งเดียว' THEN 'once' WHEN 'รายวัน' THEN ? ELSE ? END`,
    )
    .bind(couple, id, day, weekStart(day))
    .first();
  if (done) return { applied: false };
  throw new QuestError(
    "ทำภารกิจไม่ได้: ตรวจผู้รับผิดชอบ วันครบกำหนด หรือภารกิจที่ถูกลบ",
    400,
  );
}
export async function redeemReward(
  db: D1Database,
  actor: string,
  input: unknown,
) {
  const { reward_id, request_id } = redeemRewardSchema.parse(input),
    couple = await scope(db, actor);
  const [insert, existing] = await db.batch<Record<string, unknown>>([
    // Balance check and spend share the INSERT's snapshot; parallel requests cannot overdraw it.
    db
      .prepare(
        `INSERT INTO heart_entries(couple_id,id,kind,actor_id,reward_id,title,amount,created_at) SELECT ?,?,'redemption',?,r.id,r.title,-r.cost,? FROM reward_catalog r WHERE r.id = ? AND r.active = 1 AND r.category='reward' AND NOT EXISTS(SELECT 1 FROM heart_entries WHERE couple_id = ? AND id = ?) AND coalesce((SELECT balance FROM heart_wallets WHERE couple_id = ?),0) >= r.cost RETURNING id`,
      )
      .bind(
        couple,
        request_id,
        actor,
        Date.now(),
        reward_id,
        couple,
        request_id,
        couple,
      ),
    db
      .prepare(
        "SELECT kind,reward_id FROM heart_entries WHERE couple_id = ? AND id = ?",
      )
      .bind(couple, request_id),
  ]);
  const replay = existing.results[0];
  if (!replay)
    throw new QuestError("หัวใจยังไม่พอ หรือรางวัลนี้ไม่พร้อมให้แลก", 400);
  if (replay.kind !== "redemption" || replay.reward_id !== reward_id)
    throw new QuestError("รหัสคำขอนี้ใช้กับรายการอื่นแล้ว");
  return { applied: insert.results.length > 0 };
}
