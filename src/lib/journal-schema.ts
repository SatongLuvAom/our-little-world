import { z } from "zod";
export const moodNames = [
  "สดใส",
  "อบอุ่น",
  "เหนื่อยนิดหน่อย",
  "อยากได้กอด",
  "ตื่นเต้น",
] as const;
export const journalSaveSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("memory"),
      id: z.uuid(),
      title: z.string().trim().min(1).max(120),
      day: z.iso.date(),
      note: z.string().trim().max(2000),
      photo: z.string().max(266690),
    })
    .strict(),
  z
    .object({
      kind: z.literal("letter"),
      id: z.uuid(),
      title: z.string().trim().min(1).max(120),
      body: z.string().trim().min(1).max(5000),
      openOn: z.iso.date(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("mood"),
      day: z.iso.date(),
      mood: z.enum(moodNames),
      note: z.string().trim().max(300),
      version: z.number().int().nonnegative(),
    })
    .strict(),
]);
export const journalDeleteSchema = z
  .object({ kind: z.enum(["memory", "letter"]), id: z.uuid() })
  .strict();
export const journalStateSchema = z.object({
  day: z.iso.date(),
  memories: z.array(
    z.object({
      id: z.uuid(),
      author_id: z.uuid(),
      title: z.string(),
      day: z.iso.date(),
      note: z.string(),
      photo: z.string(),
    }),
  ),
  letters: z.array(
    z.object({
      id: z.uuid(),
      author_id: z.uuid(),
      title: z.string(),
      openOn: z.iso.date(),
      locked: z.boolean(),
    }),
  ),
  moods: z.array(
    z.object({
      user_id: z.uuid(),
      day: z.iso.date(),
      mood: z.enum(moodNames),
      note: z.string(),
      version: z.number().int().positive(),
    }),
  ),
});
export type JournalState = z.infer<typeof journalStateSchema>;
