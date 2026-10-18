"use client";
import { pendingStorage, beginOnlineOperation } from "@/lib/client-safety";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { toast } from "sonner";
import {
  backupArchiveSchema,
  backupSummarySchema,
  sealedBackupSchema,
  MAX_BACKUP_FILE,
  type BackupArchive,
  type BackupSummary,
} from "@/lib/backup-schema";
import { useQuests } from "@/lib/quest-store";
import { Button } from "./ui/button";
import { Sheet } from "./ui/dialog";
import { SectionTitle } from "./shared";

const previewSchema = z.object({ id: z.uuid(), summary: backupSummarySchema });
type Preview = z.infer<typeof previewSchema>;
async function api(operation: string, body: unknown) {
  let response: Response;
  try {
    response = await fetch("/api/backup/" + operation, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    throw Error(
      "เชื่อมต่อไม่ได้ หากยืนยันกู้คืนแล้ว ให้ตรวจสอบผลเดิมก่อนเริ่มรายการใหม่",
    );
  }
  const data = await response.json();
  if (!response.ok)
    throw Error(data.error || "ดำเนินการไม่สำเร็จ กรุณาลองใหม่");
  return data;
}
function Summary({ summary }: { summary: BackupSummary }) {
  return (
    <div className="account-note">
      <p>
        สำรองเมื่อ{" "}
        {new Date(summary.created_at).toLocaleString("th-TH", {
          timeZone: "Asia/Bangkok",
        })}
        <br />
        {Object.values(summary.counts).reduce((a, b) => a + b, 0)} รายการ ·{" "}
        {summary.counts.memories || 0} ความทรงจำ ·{" "}
        {summary.counts.love_letters || 0} จดหมาย
        <br />
        {summary.hearts} หัวใจ · เงินออม{" "}
        {(summary.savings_cents / 100).toLocaleString("th-TH", {
          minimumFractionDigits: 2,
        })}{" "}
        บาท
      </p>
    </div>
  );
}
export function BackupTools() {
  const { demo, ready, state, refresh } = useQuests(),
    couple = state?.couple.id;
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [confirmation, setConfirmation] = useState("");
  const working = useRef(false),
    storageKey = couple ? "olw:restore:" + couple : "";
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!storageKey) return;
      try {
        const saved = pendingStorage.getItem(storageKey);
        if (saved) {
          setPreview(previewSchema.parse(JSON.parse(saved)));
          setOpen(true);
        }
      } catch {
        setError("อ่านรายการกู้คืนค้างไม่สำเร็จ กรุณาเลือกไฟล์สำรองใหม่");
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [storageKey]);
  async function run(action: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    let finish: (() => void) | undefined;
    try {
      finish = beginOnlineOperation();
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      finish?.();
      working.current = false;
      setBusy(false);
      setProgress("");
    }
  }
  async function download() {
    await run(async () => {
      setProgress("กำลังเตรียมข้อมูลสำรอง");
      const start = z
        .object({ manifest: sealedBackupSchema, summary: backupSummarySchema })
        .parse(await api("start", {}));
      const archive: BackupArchive = {
        app: "our-little-world",
        version: 1,
        manifest: start.manifest,
        parts: [],
      };
      let size = JSON.stringify(archive).length;
      for (let index = 0; index < start.summary.parts; index++) {
        setProgress(`กำลังสำรอง ${index + 1}/${start.summary.parts}`);
        const part = sealedBackupSchema.parse(
          await api("export-part", { manifest: start.manifest, index }),
        );
        size += JSON.stringify(part).length + 1;
        if (size > MAX_BACKUP_FILE)
          throw Error("ไฟล์สำรองเกิน 64 MB กรุณาให้ผู้ดูแลช่วยสำรอง D1");
        archive.parts.push(part);
      }
      const blob = new Blob([JSON.stringify(archive)], {
        type: "application/json",
      });
      if (blob.size > MAX_BACKUP_FILE) throw Error("ไฟล์สำรองใหญ่เกินไป");
      const url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download =
        "our-little-world-" +
        new Date().toISOString().slice(0, 10) +
        ".olw-backup";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast.success(
        "สร้างไฟล์สำรองแล้ว กรุณาเก็บไฟล์ที่ดาวน์โหลดไว้อีกที่หนึ่ง",
      );
    });
  }
  async function inspect(file: File) {
    await run(async () => {
      setPreview(null);
      setConfirmation("");
      if (file.size > MAX_BACKUP_FILE) throw Error("ไฟล์ต้องไม่เกิน 64 MB");
      let archive: BackupArchive;
      try {
        archive = backupArchiveSchema.parse(JSON.parse(await file.text()));
      } catch {
        throw Error("รูปแบบไฟล์ไม่ถูกต้อง กรุณาใช้ไฟล์ .olw-backup ของคู่เรา");
      }
      setProgress("กำลังตรวจไฟล์สำรอง");
      const result = previewSchema.parse(
        await api("preview", { manifest: archive.manifest }),
      );
      try {
        if (archive.parts.length !== result.summary.parts)
          throw Error("ไฟล์สำรองมีข้อมูลไม่ครบ");
        for (let index = 0; index < archive.parts.length; index++) {
          setProgress(`กำลังตรวจข้อมูล ${index + 1}/${archive.parts.length}`);
          await api("upload-part", {
            id: result.id,
            index,
            part: archive.parts[index],
          });
        }
        // Persist the receipt before allowing commit, including retries after a lost response/reload.
        pendingStorage.setItem(storageKey, JSON.stringify(result));
        setPreview(result);
      } catch (error) {
        try {
          await api("cancel", { id: result.id });
        } catch {
          throw Error(
            (error instanceof Error ? error.message : "ตรวจไฟล์ไม่สำเร็จ") +
              " · ยังล้างข้อมูลพักไม่ได้ กรุณาเลือกไฟล์ใหม่เพื่อล้างรายการเดิม",
          );
        }
        throw error;
      }
    });
  }
  async function restore() {
    if (!preview || confirmation !== "กู้คืนข้อมูล") return;
    await run(async () => {
      setProgress("กำลังกู้คืนข้อมูล กรุณารอผลรายการเดิม");
      await api("commit", { id: preview.id, confirmation });
      pendingStorage.removeItem(storageKey);
      setPreview(null);
      setConfirmation("");
      setOpen(false);
      await refresh(true);
      toast.success("กู้คืนข้อมูลของคู่เราแล้ว");
    });
  }
  if (demo) return null;
  return (
    <section className="panel settings">
      <SectionTitle title="สำรองและกู้คืนข้อมูลคู่ของเรา" />
      <p className="muted text-sm">
        ดาวน์โหลดไฟล์เข้ารหัส รวมภารกิจ หัวใจ เงินออม แผน ความทรงจำ รูป จดหมาย
        Mood และแมว ใช้กู้คืนคู่เดิมบนเว็บนี้ได้ จดหมายยังเปิดตามเวลาเดิม
      </p>
      <p className="muted text-sm">
        ไฟล์นี้ไม่สำรอง Passkey หรือบัญชี กรุณาเก็บ Passkey
        สำรองและไฟล์ไว้อย่างปลอดภัย หากเข้าสู่ระบบมานานเกิน 15 นาที
        ต้องเข้าใหม่ก่อน
      </p>
      <div className="row-actions account-links">
        <Button disabled={!ready || busy} onClick={download}>
          สำรองข้อมูลจริง
        </Button>
        <Button
          disabled={!ready || busy}
          variant="secondary"
          onClick={() => {
            setError("");
            setOpen(true);
          }}
        >
          กู้คืนจากไฟล์
        </Button>
        <Button asChild variant="ghost">
          <Link href="/account">จัดการ Passkey</Link>
        </Button>
      </div>
      {!open && progress && <p role="status">{progress}</p>}
      {!open && error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <Sheet
        open={open}
        onOpenChange={(value) => {
          if (!working.current) setOpen(value);
        }}
        title="กู้คืนข้อมูลคู่ของเรา"
        description="ตรวจไฟล์ก่อน ข้อมูลจริงจะเปลี่ยนเมื่อยืนยันเท่านั้น การกู้คืนจะแทนที่ข้อมูลของทั้งคู่ด้วยข้อมูลในไฟล์ ควรสำรองข้อมูลปัจจุบันและแจ้งอีกคนก่อน"
      >
        <div className="form-field">
          <label htmlFor="couple-backup-file">ไฟล์สำรองคู่ของเรา</label>
          <input
            id="couple-backup-file"
            type="file"
            accept=".olw-backup,application/json"
            disabled={busy || !ready}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void inspect(file);
            }}
          />
        </div>
        {progress && <p role="status">{progress}</p>}
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        {preview && (
          <>
            <Summary summary={preview.summary} />
            <p className="muted text-sm">
              หากอีกคนแก้ข้อมูลหลังตรวจไฟล์ ระบบจะหยุดให้ตรวจใหม่ หากคำตอบหาย
              สามารถยืนยันรายการเดิมซ้ำได้โดยไม่เพิ่มยอดซ้ำ
            </p>
            <div className="form-field">
              <label htmlFor="restore-confirmation">
                พิมพ์ กู้คืนข้อมูล เพื่อยืนยันแทนที่ข้อมูลทั้งคู่
              </label>
              <input
                id="restore-confirmation"
                value={confirmation}
                disabled={busy}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
              />
            </div>
            <Button
              variant="destructive"
              disabled={busy || !ready || confirmation !== "กู้คืนข้อมูล"}
              onClick={restore}
            >
              ยืนยันกู้คืนข้อมูล
            </Button>
          </>
        )}
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          ปิด
        </Button>
      </Sheet>
    </section>
  );
}
