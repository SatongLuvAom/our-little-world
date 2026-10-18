import { z } from "zod";
export const feedPetSchema = z.object({ request_id: z.uuid() }).strict();
export const purchasePetSchema = z
  .object({ item_id: z.string().min(1).max(40), request_id: z.uuid() })
  .strict();
export const equipPetSchema = z
  .object({
    item_id: z.string().min(1).max(40).nullable(),
    version: z.number().int().nonnegative(),
  })
  .strict();
export const renamePetSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    version: z.number().int().nonnegative(),
  })
  .strict();
export const petStateSchema = z.object({
  server_now: z.number().int(),
  pet: z.object({
    name: z.string(),
    feeds: z.number().int().nonnegative(),
    last_fed: z.number().int().nullable(),
    next_feed_at: z.number().int().nullable(),
    wearing: z.string().nullable(),
    version: z.number().int().nonnegative(),
  }),
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      cost: z.number().int().positive(),
      active: z.boolean(),
      owned: z.boolean(),
    }),
  ),
  achievements: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      detail: z.string(),
      progress: z.number().int().nonnegative(),
      target: z.number().int().positive(),
      unlocked_at: z.number().int().nullable(),
    }),
  ),
});
export type PetState = z.infer<typeof petStateSchema>;
