import type { D1Database } from "@cloudflare/workers-types";
import { z } from "zod";
import {
  deletePlanningSchema,
  depositSchema,
  planningStateSchema,
  reversalSchema,
  savePlanningSchema,
  savingsHistorySchema,
} from "./planning-schema";
export class PlanningError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
async function scope(db: D1Database, actor: string) {
  z.uuid().parse(actor);
  const row = await db
    .prepare("SELECT couple_id FROM couple_members WHERE user_id = ?")
    .bind(actor)
    .first<{ couple_id: string }>();
  if (!row)
    throw new PlanningError("สร้างคู่หรือรับคำเชิญก่อนใช้ข้อมูลร่วมกัน", 403);
  return row.couple_id;
}
const records = {
  goal: {
    table: "savings_goals",
    columns: ["title", "target_cents", "due"],
    softDelete: false,
  },
  date: {
    table: "planned_dates",
    columns: ["title", "place", "day", "time", "budget_cents"],
    softDelete: true,
  },
  wish: {
    table: "planned_wishes",
    columns: ["title", "category", "done"],
    softDelete: true,
  },
  event: {
    table: "planned_events",
    columns: ["title", "day", "event_kind"],
    softDelete: true,
  },
} as const;
const balanceRowSchema = z.object({
  goal_id: z.string(),
  contributor_id: z.string(),
  total_cents: z.number().int().nonnegative(),
});
export async function savePlanningRecord(
  db: D1Database,
  actor: string,
  input: unknown,
) {
  const data = savePlanningSchema.parse(input),
    couple = await scope(db, actor);
  const config = records[data.kind],
    active = config.softDelete ? " AND deleted_at IS NULL" : "";
  // Identifiers come only from this fixed server map; all user data is bound.
  const values = config.columns.map((column) => {
    const value = data[column as keyof typeof data];
    return typeof value === "boolean" ? Number(value) : value;
  });
  const result =
    data.version === 0
      ? await db
          .prepare(
            `INSERT INTO ${config.table}(id,couple_id,${config.columns.join(",")},created_at) SELECT ${Array(
              values.length + 3,
            )
              .fill("?")
              .join(
                ",",
              )} WHERE (SELECT count(*) FROM ${config.table} WHERE couple_id = ?${active}) < 200 ON CONFLICT(id) DO NOTHING RETURNING id`,
          )
          .bind(data.id, couple, ...values, Date.now(), couple)
          .all()
      : await db
          .prepare(
            `UPDATE ${config.table} SET ${config.columns.map((c) => c + " = ?").join(",")},version = version + 1 WHERE id = ? AND couple_id = ? AND version = ?${active} RETURNING id`,
          )
          .bind(...values, data.id, couple, data.version)
          .all();
  if (result.results.length) return;
  if (data.version === 0) {
    const existing = await db
      .prepare(
        `SELECT ${config.columns.join(",")} FROM ${config.table} WHERE id = ? AND couple_id = ?${active}`,
      )
      .bind(data.id, couple)
      .first();
    if (existing && config.columns.every((c, i) => existing[c] === values[i]))
      return;
  }
  throw new PlanningError(
    "ข้อมูลเปลี่ยนแล้วหรือมีครบ 200 รายการ กรุณาโหลดล่าสุดก่อนบันทึกใหม่",
  );
}
export async function deletePlanningRecord(
  db: D1Database,
  actor: string,
  input: unknown,
) {
  const { kind, id } = deletePlanningSchema.parse(input),
    couple = await scope(db, actor);
  const result = await db
    .prepare(
      `UPDATE ${records[kind].table} SET deleted_at = coalesce(deleted_at,?),version = version + (deleted_at IS NULL) WHERE couple_id = ? AND id = ? RETURNING id`,
    )
    .bind(Date.now(), couple, id)
    .first();
  if (!result) throw new PlanningError("ไม่พบรายการนี้", 404);
}
function historyStatement(db: D1Database, couple: string, before?: string) {
  return db
    .prepare(
      `SELECT e.id,e.goal_id,g.title AS goal_title,e.actor_id,e.contributor_id,e.kind,e.amount_cents,e.reverses_id,e.note,e.created_at,EXISTS(SELECT 1 FROM savings_entries r WHERE r.couple_id = e.couple_id AND r.reverses_id = e.id AND r.kind = 'reversal') AS reversed FROM savings_entries e JOIN savings_goals g ON g.couple_id = e.couple_id AND g.id = e.goal_id WHERE e.couple_id = ?1 ${before ? "AND (e.created_at,e.id) < (SELECT created_at,id FROM savings_entries WHERE couple_id = ?1 AND id = ?2)" : ""} ORDER BY e.created_at DESC,e.id DESC LIMIT 31`,
    )
    .bind(...(before ? [couple, before] : [couple]));
}
function historyPage(rows: Record<string, unknown>[]) {
  const entries = savingsHistorySchema.shape.entries.parse(
    rows.slice(0, 30).map((e) => ({ ...e, reversed: Boolean(e.reversed) })),
  );
  return { entries, nextCursor: rows.length > 30 ? entries.at(-1)!.id : null };
}
export async function getSavingsHistory(
  db: D1Database,
  actor: string,
  before: string,
) {
  z.uuid().parse(before);
  const couple = await scope(db, actor);
  return historyPage(
    (await historyStatement(db, couple, before).all<Record<string, unknown>>())
      .results,
  );
}
export async function getPlanningState(db: D1Database, actor: string) {
  const couple = await scope(db, actor);
  const [goals, balances, dates, wishes, events, history] = await db.batch<
    Record<string, unknown>
  >([
    db
      .prepare(
        "SELECT id,title,target_cents,due,version FROM savings_goals WHERE couple_id = ? ORDER BY created_at,id LIMIT 200",
      )
      .bind(couple),
    db
      .prepare(
        "SELECT goal_id,contributor_id,total_cents FROM savings_balances WHERE couple_id = ?",
      )
      .bind(couple),
    db
      .prepare(
        "SELECT id,title,place,day,time,budget_cents,version FROM planned_dates WHERE couple_id = ? AND deleted_at IS NULL ORDER BY day,time,id LIMIT 200",
      )
      .bind(couple),
    db
      .prepare(
        "SELECT id,title,category,done,version FROM planned_wishes WHERE couple_id = ? AND deleted_at IS NULL ORDER BY created_at,id LIMIT 200",
      )
      .bind(couple),
    db
      .prepare(
        "SELECT id,title,day,event_kind,version FROM planned_events WHERE couple_id = ? AND deleted_at IS NULL ORDER BY day,id LIMIT 200",
      )
      .bind(couple),
    historyStatement(db, couple),
  ]);
  const totals = new Map<string, Record<string, number>>();
  for (const b of balances.results) {
    const row = balanceRowSchema.parse(b);
    const contributions = totals.get(row.goal_id) || {};
    contributions[row.contributor_id] = row.total_cents;
    totals.set(row.goal_id, contributions);
  }
  return planningStateSchema.parse({
    goals: goals.results.map((g) => {
      const contributions = totals.get(String(g.id)) || {};
      return {
        ...g,
        contributions,
        total_cents: Object.values(contributions).reduce(
          (sum, n) => sum + n,
          0,
        ),
      };
    }),
    dates: dates.results,
    wishes: wishes.results.map((w) => ({ ...w, done: Boolean(w.done) })),
    events: events.results,
    history: historyPage(history.results),
  });
}
export async function addSavingsEntry(
  db: D1Database,
  actor: string,
  input: unknown,
) {
  const data = depositSchema.parse(input),
    couple = await scope(db, actor);
  const [insert, existing] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `INSERT INTO savings_entries(couple_id,id,goal_id,actor_id,contributor_id,kind,amount_cents,note,created_at) SELECT ?,?,?,?,?, 'deposit',?,?,? WHERE EXISTS(SELECT 1 FROM savings_goals WHERE couple_id = ? AND id = ?) AND EXISTS(SELECT 1 FROM couple_members WHERE couple_id = ? AND user_id = ?) AND coalesce((SELECT sum(total_cents) FROM savings_balances WHERE couple_id = ? AND goal_id = ?),0) + ? <= 10000000000 ON CONFLICT DO NOTHING RETURNING id`,
      )
      .bind(
        couple,
        data.id,
        data.goal_id,
        actor,
        data.contributor_id,
        data.amount_cents,
        data.note,
        Date.now(),
        couple,
        data.goal_id,
        couple,
        data.contributor_id,
        couple,
        data.goal_id,
        data.amount_cents,
      ),
    db
      .prepare(
        "SELECT kind,goal_id,contributor_id,amount_cents,note FROM savings_entries WHERE couple_id = ? AND id = ?",
      )
      .bind(couple, data.id),
  ]);
  const row = existing.results[0];
  if (!row)
    throw new PlanningError(
      "บันทึกไม่ได้: ตรวจเป้าหมาย สมาชิก และยอดรวมไม่เกิน 100 ล้านบาท",
      400,
    );
  if (
    row.kind !== "deposit" ||
    ["goal_id", "contributor_id", "amount_cents", "note"].some(
      (k) => row[k] !== data[k as keyof typeof data],
    )
  )
    throw new PlanningError("รหัสคำขอนี้ใช้กับรายการอื่นแล้ว");
  return { applied: insert.results.length > 0 };
}
export async function reverseSavingsEntry(
  db: D1Database,
  actor: string,
  input: unknown,
) {
  const data = reversalSchema.parse(input),
    couple = await scope(db, actor);
  const [insert, existing, reversed] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `INSERT INTO savings_entries(couple_id,id,goal_id,actor_id,contributor_id,kind,amount_cents,reverses_id,note,created_at) SELECT e.couple_id,?,e.goal_id,?,e.contributor_id,'reversal',-e.amount_cents,e.id,?,? FROM savings_entries e WHERE e.couple_id = ? AND e.id = ? AND e.kind = 'deposit' AND NOT EXISTS(SELECT 1 FROM savings_entries WHERE couple_id = ? AND (id = ? OR (kind = 'reversal' AND reverses_id = ?))) ON CONFLICT DO NOTHING RETURNING id`,
      )
      .bind(
        data.id,
        actor,
        data.note,
        Date.now(),
        couple,
        data.entry_id,
        couple,
        data.id,
        data.entry_id,
      ),
    db
      .prepare(
        "SELECT kind,reverses_id,note FROM savings_entries WHERE couple_id = ? AND id = ?",
      )
      .bind(couple, data.id),
    db
      .prepare(
        "SELECT id FROM savings_entries WHERE couple_id = ? AND reverses_id = ? AND kind = 'reversal'",
      )
      .bind(couple, data.entry_id),
  ]);
  const row = existing.results[0];
  if (
    row &&
    (row.kind !== "reversal" ||
      row.reverses_id !== data.entry_id ||
      row.note !== data.note)
  )
    throw new PlanningError("รหัสคำขอนี้ใช้กับรายการอื่นแล้ว");
  if (!row && !reversed.results.length)
    throw new PlanningError("ไม่พบรายการออมที่หักล้างได้", 404);
  return { applied: insert.results.length > 0 };
}
