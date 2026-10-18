import { z } from "zod";

export const sealedBackupSchema = z
  .object({
    iv: z.string().length(16),
    data: z.string().min(24).max(550000),
  })
  .strict();
export const backupArchiveSchema = z
  .object({
    app: z.literal("our-little-world"),
    version: z.literal(1),
    manifest: sealedBackupSchema,
    parts: z.array(sealedBackupSchema).max(3000),
  })
  .strict();
export const backupSummarySchema = z.object({
  created_at: z.number(),
  counts: z.record(z.string(), z.number().int().nonnegative()),
  hearts: z.number().int().nonnegative(),
  savings_cents: z.number().int().nonnegative(),
  parts: z.number().int().nonnegative(),
});
export type SealedBackup = z.infer<typeof sealedBackupSchema>;
export type BackupArchive = z.infer<typeof backupArchiveSchema>;
export type BackupSummary = z.infer<typeof backupSummarySchema>;
export const MAX_BACKUP_FILE = 64000000;
