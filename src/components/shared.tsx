"use client";
import { Component, lazy, Suspense, useState, useSyncExternalStore } from "react";
import type { FieldValues, DefaultValues } from "react-hook-form";
import type { z } from "zod";
import { Plus, Sparkles, Heart, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Sheet } from "./ui/dialog";
import { useWorld } from "@/lib/world-store";
import { useJournal } from "@/lib/journal-store";
import { reportClientError } from "@/lib/error-reporting";
import {
  beginAppUpdate,
  isAppBusy,
  isOnline,
  serverOnline,
  subscribeBusy,
  subscribeConnection,
} from "@/lib/client-safety";
const EditorForm = lazy(() => import("./editor-form")) as typeof import("./editor-form").default;

function FormLoadFailure() {
  const online = useSyncExternalStore(subscribeConnection, isOnline, serverOnline);
  const busy = useSyncExternalStore(subscribeBusy, isAppBusy, () => false);
  return (
    <div role="alert" className="error-banner">
      <p>เปิดแบบฟอร์มไม่สำเร็จ</p>
      <p className="muted text-sm">
        {!online
          ? "เชื่อมต่ออินเทอร์เน็ตก่อนโหลดหน้าใหม่"
          : busy
            ? "รอให้การบันทึกที่กำลังทำอยู่เสร็จก่อนโหลดหน้าใหม่"
            : "ข้อมูลที่ยังไม่ได้บันทึกอาจต้องกรอกอีกครั้ง"}
      </p>
      <Button
        disabled={!online || busy}
        onClick={() => {
          if (beginAppUpdate()) window.location.reload();
        }}
      >
        โหลดหน้าใหม่
      </Button>
    </div>
  );
}

class EditorFormBoundary extends Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    reportClientError("render");
  }
  render() {
    return this.state.failed ? <FormLoadFailure /> : this.props.children;
  }
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
export function SectionTitle({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {detail && <p className="muted text-sm">{detail}</p>}
      </div>
      {action}
    </div>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="empty">
      <Sparkles size={28} />
      <p>{children}</p>
    </div>
  );
}
export function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(100, Math.max(0, Math.round(value)))}
    >
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
export function Hearts({ value }: { value: number }) {
  return (
    <span className="heart-pill">
      <Heart size={15} fill="currentColor" />
      {value.toLocaleString("th-TH")}
    </span>
  );
}
export type Field = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "time" | "textarea" | "select";
  options?: (string | { value: string; label: string })[];
  min?: number;
  max?: number;
  step?: string;
};
export function Editor<T extends FieldValues>({
  title,
  schema,
  values,
  fields,
  onSave,
  trigger,
  description,
  disabled,
}: {
  title: string;
  schema: z.ZodType<T>;
  values: NoInfer<DefaultValues<T>>;
  fields: Field[];
  onSave: (data: NoInfer<T>) => boolean | Promise<boolean>;
  trigger?: React.ReactNode;
  description?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={trigger ? "ghost" : "default"}
        size={trigger ? "icon" : "default"}
        onClick={() => setOpen(true)}
        aria-label={trigger ? title : undefined}
        disabled={disabled}
      >
        {trigger || (
          <>
            <Plus size={18} />
            {title}
          </>
        )}
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
      >
        {open && (
          <EditorFormBoundary>
            <Suspense fallback={<p role="status" className="muted text-sm">กำลังเปิดแบบฟอร์ม…</p>}>
              <EditorForm
                schema={schema}
                values={values}
                fields={fields}
                onSave={async (data) => {
                  if (await onSave(data)) setOpen(false);
                }}
              />
            </Suspense>
          </EditorFormBoundary>
        )}
      </Sheet>
    </>
  );
}
export function DeleteButton({
  label,
  onDelete,
}: {
  label: string;
  onDelete: () => void | boolean | Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`ลบ${label}`}
        onClick={() => setOpen(true)}
      >
        <Trash2 size={16} />
      </Button>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
        title={`ลบ${label}?`}
        description="เมื่อลบแล้วจะเรียกคืนรายการนี้ไม่ได้"
      >
        <Button
          variant="destructive"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            try {
              if ((await onDelete()) !== false) setOpen(false);
            } finally {
              setPending(false);
            }
          }}
        >
          ยืนยันการลบ
        </Button>
      </Sheet>
    </>
  );
}
export function MoodCheckin() {
  const { world, update } = useWorld();
  const journal = useJournal();
  const [who, setWho] = useState<"เรา" | "เธอ">("เรา");
  const [note, setNote] = useState("");
  const moods = [
    { face: "☀", label: "สดใส" },
    { face: "♡", label: "อบอุ่น" },
    { face: "☁", label: "เหนื่อยนิดหน่อย" },
    { face: "☂", label: "อยากได้กอด" },
    { face: "✦", label: "ตื่นเต้น" },
  ];
  const day = journal.day;
  const current = journal.moods.find(
    (m) =>
      m.user_id === (journal.demo ? who : journal.state?.actor_id) &&
      m.day === day,
  );
  return (
    <div className="mood-content">
      {journal.demo ? (
        <div className="segmented small">
          {(["เรา", "เธอ"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setWho(p)}
              className={who === p ? "active" : ""}
              aria-pressed={who === p}
            >
              {p === "เรา" ? world.profile.name1 : world.profile.name2}
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">
          บันทึกความรู้สึกของคุณ ·{" "}
          {
            journal.state?.couple.members.find(
              (m) => m.id === journal.state?.actor_id,
            )?.name
          }
        </p>
      )}
      <div className="mood-options">
        {moods.map((m, i) => (
          <button
            key={m.label}
            aria-label={`อารมณ์${m.label}`}
            aria-pressed={current?.mood === m.label}
            className={`mood-option mood-${i} ${current?.mood === m.label ? "selected" : ""}`}
            disabled={!journal.ready || journal.pending}
            onClick={() =>
              journal.demo
                ? update(
                    (s) => ({
                      ...s,
                      moods: [
                        {
                          id: crypto.randomUUID(),
                          person: who,
                          day,
                          mood: m.label,
                          note,
                        },
                        ...s.moods.filter(
                          (item) => !(item.person === who && item.day === day),
                        ),
                      ],
                    }),
                    "ส่งความรู้สึกให้โลกของเราแล้ว",
                  )
                : journal.save({
                    kind: "mood",
                    day,
                    mood: m.label,
                    note,
                    version: current?.version || 0,
                  })
            }
          >
            <span>{m.face}</span>
            <small>{m.label}</small>
          </button>
        ))}
      </div>
      <label className="sr-only" htmlFor="mood-note">
        ข้อความบอกความรู้สึก
      </label>
      <input
        id="mood-note"
        placeholder="มีอะไรอยากเล่าให้ฟังไหม… (ใส่ก่อนเลือกอารมณ์)"
        maxLength={300}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {current && (
        <p className="mood-saved">
          วันนี้รู้สึก{current.mood}
          {current.note ? ` · ${current.note}` : ""}
        </p>
      )}
    </div>
  );
}
