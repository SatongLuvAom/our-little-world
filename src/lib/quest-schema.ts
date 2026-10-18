import { z } from "zod";
import { questSchema } from "./model";
import { planningStateSchema } from "./planning-schema";
import { journalStateSchema } from "./journal-schema";
import { petStateSchema } from "./pet-schema";

export const saveQuestSchema = questSchema
  .omit({ owner: true })
  .extend({
    id: z.uuid(),
    assignee_id: z.uuid().nullable(),
    version: z.number().int().min(0),
  })
  .strict();
export const completeQuestSchema = z
  .object({ id: z.uuid(), request_id: z.uuid() })
  .strict();
export const redeemRewardSchema = z
  .object({ reward_id: z.string().min(1).max(40), request_id: z.uuid() })
  .strict();
export const deleteQuestSchema = z.object({ id: z.uuid() }).strict();
export const rewardSchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  icon: z.string(),
  cost: z.number().int().positive(),
});
export const heartEntrySchema = z.object({
  category: z.enum(["reward", "pet"]).default("reward"),
  id: z.uuid(),
  kind: z.enum(["completion", "redemption"]),
  actor_id: z.uuid(),
  quest_id: z.uuid().nullable(),
  period: z.string().nullable(),
  reward_id: z.string().nullable(),
  title: z.string(),
  amount: z.number().int(),
  created_at: z.number(),
});
export const heartHistorySchema = z.object({
  entries: z.array(heartEntrySchema),
  nextCursor: z.uuid().nullable(),
});
export const questStateSchema = z.object({
  actor_id: z.uuid(),
  couple: z.object({
    id: z.uuid(),
    anniversary: z.iso.date(),
    members: z
      .array(z.object({ id: z.uuid(), name: z.string() }))
      .min(1)
      .max(2),
  }),
  day: z.iso.date(),
  quests: z.array(saveQuestSchema.extend({ done: z.boolean() })),
  rewards: z.array(rewardSchema),
  balance: z.number().int().nonnegative(),
  completionCount: z.number().int().nonnegative(),
  todayCompletionCount: z.number().int().nonnegative(),
  history: heartHistorySchema,
  planning: planningStateSchema.optional(),
  journal: journalStateSchema.optional(),
  gamification: petStateSchema.optional(),
});
export type QuestState = z.infer<typeof questStateSchema>;
export type SaveQuest = z.infer<typeof saveQuestSchema>;
export type HeartEntry = z.infer<typeof heartEntrySchema>;
