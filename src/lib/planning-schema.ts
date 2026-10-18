import * as z from "zod";
import { dateSchema, eventSchema, goalSchema, wishSchema } from "./model";
export const centsSchema = z.number().int().min(0).max(1000000000);
export const bahtSchema = z
  .number()
  .min(0)
  .max(10000000)
  .multipleOf(0.01, "ระบุทศนิยมไม่เกิน 2 ตำแหน่ง");
export const targetBahtSchema = z
  .number()
  .positive()
  .max(100000000)
  .multipleOf(0.01, "ระบุทศนิยมไม่เกิน 2 ตำแหน่ง");
const identity = { id: z.uuid(), version: z.number().int().nonnegative() };
export const saveGoalSchema = goalSchema
  .omit({ target: true })
  .extend({
    ...identity,
    kind: z.literal("goal"),
    target_cents: z.number().int().positive().max(10000000000),
  })
  .strict();
export const saveDateSchema = dateSchema
  .omit({ budget: true })
  .extend({
    ...identity,
    kind: z.literal("date"),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    budget_cents: centsSchema,
  })
  .strict();
export const saveWishSchema = wishSchema
  .extend({ ...identity, kind: z.literal("wish") })
  .strict();
export const saveEventSchema = eventSchema
  .omit({ kind: true })
  .extend({
    ...identity,
    kind: z.literal("event"),
    event_kind: eventSchema.shape.kind,
  })
  .strict();
export const savePlanningSchema = z.discriminatedUnion("kind", [
  saveGoalSchema,
  saveDateSchema,
  saveWishSchema,
  saveEventSchema,
]);
export const deletePlanningSchema = z
  .object({ kind: z.enum(["date", "wish", "event"]), id: z.uuid() })
  .strict();
export const depositSchema = z
  .object({
    id: z.uuid(),
    goal_id: z.uuid(),
    contributor_id: z.uuid(),
    amount_cents: centsSchema.positive(),
    note: z.string().trim().max(200),
  })
  .strict();
export const reversalSchema = z
  .object({
    id: z.uuid(),
    entry_id: z.uuid(),
    note: z.string().trim().min(1).max(200),
  })
  .strict();
export const savingsEntrySchema = z.object({
  id: z.uuid(),
  goal_id: z.uuid(),
  goal_title: z.string(),
  actor_id: z.uuid(),
  contributor_id: z.uuid(),
  kind: z.enum(["deposit", "reversal"]),
  amount_cents: z.number().int(),
  reverses_id: z.uuid().nullable(),
  note: z.string(),
  created_at: z.number(),
  reversed: z.boolean(),
});
export const savingsHistorySchema = z.object({
  entries: z.array(savingsEntrySchema),
  nextCursor: z.uuid().nullable(),
});
export const planningStateSchema = z.object({
  goals: z.array(
    saveGoalSchema
      .omit({ kind: true })
      .extend({
        total_cents: z.number().int().nonnegative(),
        contributions: z.record(z.uuid(), z.number().int().nonnegative()),
      }),
  ),
  dates: z.array(saveDateSchema.omit({ kind: true })),
  wishes: z.array(saveWishSchema.omit({ kind: true })),
  events: z.array(saveEventSchema.omit({ kind: true })),
  history: savingsHistorySchema,
});
export type PlanningState = z.infer<typeof planningStateSchema>;
export type PlanningRecord = z.infer<typeof savePlanningSchema>;
export type SavingsEntry = z.infer<typeof savingsEntrySchema>;
export type Deposit = z.infer<typeof depositSchema>;
export function anniversaryDay(since: string, year: number) {
  const monthDay = since.slice(5);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return `${year}-${monthDay === "02-29" && !leap ? "02-28" : monthDay}`;
}
