"use client";
import { useState } from "react";
import Image from "next/image";
import { z } from "zod";
import { Camera, LockKeyhole, MailOpen, Send, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { useWorld } from "@/lib/world-store";
import { useJournal } from "@/lib/journal-store";
import { letterSchema, memorySchema } from "@/lib/model";
import { dateLabel, today } from "@/lib/utils";
import { DeleteButton, Editor, Empty, SectionTitle } from "./shared";
import { Button } from "./ui/button";
import { Sheet } from "./ui/dialog";
export function MemoriesTool() {
  const { update } = useWorld();
  const journal = useJournal();
  const [id, setId] = useState(() => crypto.randomUUID());
  const [photo, setPhoto] = useState("");
  const [uploading, setUploading] = useState(false);
  async function readPhoto(file?: File) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 10000000
    ) {
      toast.error("เลือกรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 10 MB");
      return;
    }
    setUploading(true);
    try {
      const bitmap = await createImageBitmap(file);
      let result = "";
      try {
        if (bitmap.width * bitmap.height > 32000000)
          throw Error("รูปใหญ่เกินไป");
        const canvas = document.createElement("canvas"),
          ctx = canvas.getContext("2d");
        if (!ctx) throw Error("ไม่รองรับการย่อรูป");
        let edge = 768;
        do {
          const scale = Math.min(
            1,
            edge / Math.max(bitmap.width, bitmap.height),
          );
          canvas.width = Math.max(1, Math.round(bitmap.width * scale));
          canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          result = canvas.toDataURL("image/png");
          edge = Math.floor(edge * 0.75);
        } while (result.length > 266685 && edge >= 64);
        if (result.length > 266685) throw Error("ย่อรูปไม่สำเร็จ");
      } finally {
        bitmap.close();
      }
      setPhoto(result);
      toast.success("เลือกรูปแล้ว กดเพิ่มความทรงจำเพื่อใส่เรื่องราว");
    } catch {
      toast.error("อ่านรูปไม่สำเร็จ ลองเลือกรูปอีกครั้ง");
    } finally {
      setUploading(false);
    }
  }
  return (
    <>
      <SectionTitle title="เก็บวันธรรมดาที่เราอยากจำ" />
      <div className="memory-toolbar">
        <label className="button button-secondary upload-button">
          <ImagePlus size={18} />
          {uploading
            ? "กำลังอ่านรูป…"
            : photo
              ? "เปลี่ยนรูปที่เลือก"
              : "เลือกรูปภาพ"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploading || !journal.ready || journal.pending}
            onChange={(e) => {
              void readPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <Editor
          title="เพิ่มความทรงจำ"
          schema={memorySchema.omit({ photo: true })}
          values={{ id, title: "", day: journal.day, note: "" }}
          disabled={uploading || !journal.ready || journal.pending}
          description={
            photo
              ? "แนบรูปที่ย่อแล้ว พร้อมบันทึกเรื่องราว"
              : "เพิ่มเรื่องราวได้เลย หรือปิดแล้วเลือกรูปก่อน"
          }
          fields={[
            { name: "title", label: "ตั้งชื่อวันของเรา" },
            { name: "day", label: "วันที่", type: "date" },
            { name: "note", label: "เรื่องราวที่อยากจำ", type: "textarea" },
          ]}
          onSave={async (data) => {
            const ok = journal.demo
              ? update(
                  (s) => ({
                    ...s,
                    memories: [{ ...data, photo }, ...s.memories],
                  }),
                  "เก็บความทรงจำแล้ว",
                )
              : await journal.save({ kind: "memory", ...data, photo });
            if (ok) {
              setPhoto("");
              setId(crypto.randomUUID());
            }
            return ok;
          }}
        />
      </div>
      {photo && (
        <div className="photo-preview">
          <Image
            src={photo}
            alt="รูปที่เลือกสำหรับความทรงจำ"
            width={100}
            height={80}
            unoptimized
          />
          <Button variant="ghost" onClick={() => setPhoto("")}>
            นำรูปออก
          </Button>
        </div>
      )}
      <p className="muted text-sm space-bottom">
        {journal.demo
          ? "Demo เก็บรูปในเครื่องนี้"
          : "รูปส่วนตัวเฉพาะคู่ของคุณ · ย่อเป็น PNG ไม่เกิน 200 KB · สูงสุด 100 ความทรงจำ · ลิงก์รูปหมดอายุใน 90 วินาที"}
      </p>
      <div className="memory-timeline">
        {[...journal.memories]
          .sort((a, b) => b.day.localeCompare(a.day))
          .map((m) => (
            <article className="panel memory-card" key={m.id}>
              {m.photo ? (
                <Image
                  src={m.photo}
                  alt={m.title}
                  className="memory-photo"
                  width={600}
                  height={400}
                  unoptimized
                />
              ) : (
                <div className="memory-placeholder">
                  <Camera size={42} />
                  <span>little moments, big feelings</span>
                </div>
              )}
              <div className="between">
                <span className="eyebrow">{dateLabel(m.day)}</span>
                {m.canDelete && (
                  <DeleteButton
                    label="ความทรงจำ"
                    onDelete={() =>
                      journal.demo
                        ? update(
                            (s) => ({
                              ...s,
                              memories: s.memories.filter(
                                (item) => item.id !== m.id,
                              ),
                            }),
                            "ลบความทรงจำแล้ว",
                          )
                        : journal.remove("memory", m.id)
                    }
                  />
                )}
              </div>
              <h2>{m.title}</h2>
              <p className="preserve-lines muted">{m.note}</p>
            </article>
          ))}
      </div>
      {!journal.memories.length && (
        <Empty>เริ่มหน้าหนึ่งของสมุดความทรงจำด้วยกัน</Empty>
      )}
    </>
  );
}
export function LettersTool() {
  const { world, update } = useWorld();
  const journal = useJournal();
  const [id, setId] = useState(() => crypto.randomUUID());
  const [opened, setOpened] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [reading, setReading] = useState(false);
  const letter = journal.letters.find((l) => l.id === opened);
  async function openLetter(letterId: string) {
    setReading(true);
    setBody("");
    setOpened(null);
    try {
      if (journal.demo)
        setBody(world.letters.find((l) => l.id === letterId)?.body || "");
      else {
        const response = await fetch("/api/journal/letter?id=" + letterId, {
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
          await journal.refresh(true);
          throw Error("ยังไม่ถึงวันเปิด หรือเซสชันสิ้นสุดแล้ว กรุณาโหลดล่าสุด");
        }
        const data = z
          .object({ body: z.string() })
          .parse(await response.json());
        setBody(data.body);
      }
      setOpened(letterId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "เปิดจดหมายไม่สำเร็จ",
      );
    } finally {
      setReading(false);
    }
  }
  const schema = letterSchema.extend({
    openOn: z.iso
      .date()
      .refine((day) => day >= today(), "เลือกวันนี้หรือวันข้างหน้า"),
  });
  return (
    <>
      <div className="notice">
        <LockKeyhole size={18} />
        {journal.demo
          ? "Demo ซ่อนจดหมายในหน้าจอ แต่เนื้อหายังอยู่ใน Local Storage"
          : "เนื้อจดหมายเก็บที่ server และเปิดได้ตั้งแต่ 00:00 น. ของวันที่เลือกตามเวลาไทย · ผู้เขียนเท่านั้นที่ลบได้ · สูงสุด 100 ฉบับ"}
      </div>
      <SectionTitle
        title="ถึงเธอ ในวันที่อยากให้อ่าน"
        action={
          <Editor
            title="เขียนจดหมาย"
            schema={schema}
            values={{
              id,
              title: "",
              body: "",
              openOn: journal.day,
              author: "เรา",
            }}
            disabled={!journal.ready || journal.pending}
            fields={[
              { name: "title", label: "ชื่อจดหมาย" },
              ...(journal.demo
                ? [
                    {
                      name: "author",
                      label: "จากใคร",
                      type: "select" as const,
                      options: ["เรา", "เธอ"],
                    },
                  ]
                : []),
              { name: "openOn", label: "วันเปิดอ่าน (เวลาไทย)", type: "date" },
              { name: "body", label: "ข้อความถึงเธอ", type: "textarea" },
            ]}
            onSave={async (data) => {
              const ok = journal.demo
                ? update(
                    (s) => ({
                      ...s,
                      letters: [{ ...data }, ...s.letters],
                    }),
                    "เก็บจดหมายถึงเธอแล้ว",
                  )
                : await journal.save({
                    kind: "letter",
                    id: data.id,
                    title: data.title,
                    body: data.body,
                    openOn: data.openOn,
                  });
              if (ok) setId(crypto.randomUUID());
              return ok;
            }}
          />
        }
      />
      <div className="tool-card-grid">
        {journal.letters.map((l) => {
          const locked = l.locked;
          return (
            <section className="panel letter-card" key={l.id}>
              <div className="letter-envelope">
                <Send size={40} />
                <span>with love, always</span>
              </div>
              <h2>{l.title}</h2>
              <p className="muted">
                จาก {l.authorName} · เปิด {dateLabel(l.openOn)}
              </p>
              <div className="between">
                <Button
                  variant="secondary"
                  disabled={locked || reading || !journal.ready}
                  onClick={() => void openLetter(l.id)}
                >
                  {locked ? <LockKeyhole size={16} /> : <MailOpen size={16} />}
                  {locked ? "รอวันพิเศษของเรา" : "เปิดอ่านจดหมาย"}
                </Button>
                {l.canDelete && (
                  <DeleteButton
                    label="จดหมาย"
                    onDelete={() =>
                      journal.demo
                        ? update(
                            (s) => ({
                              ...s,
                              letters: s.letters.filter(
                                (item) => item.id !== l.id,
                              ),
                            }),
                            "ลบจดหมายแล้ว",
                          )
                        : journal.remove("letter", l.id)
                    }
                  />
                )}
              </div>
            </section>
          );
        })}
      </div>
      {!journal.letters.length && (
        <Empty>คำบอกรักในอนาคต เริ่มต้นได้ที่จดหมายฉบับแรก</Empty>
      )}
      <Sheet
        open={!!letter}
        onOpenChange={(open) => {
          if (!open) {
            setOpened(null);
            setBody("");
          }
        }}
        title={letter?.title || "จดหมายถึงเธอ"}
        description="คำเล็ก ๆ ที่ตั้งใจเขียนให้เธอ"
      >
        {letter && !letter.locked && journal.ready && (
          <p className="letter-body preserve-lines">{body}</p>
        )}
      </Sheet>
    </>
  );
}
