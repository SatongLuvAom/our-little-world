"use client";
import { useState } from "react";
import { z } from "zod";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Pencil,
  CalendarDays,
  Check,
  Coffee,
} from "lucide-react";
import { usePlanning } from "@/lib/planning-store";
import { anniversaryDay, bahtSchema } from "@/lib/planning-schema";
import { QuestStatus } from "./quests";
import {
  dateSchema,
  wishSchema,
  eventSchema,
  type DatePlan,
  type World,
} from "@/lib/model";
import { today, dateLabel, money } from "@/lib/utils";
import { DeleteButton, Editor, Empty, SectionTitle } from "./shared";
import { Button } from "./ui/button";
export function DateEditor({
  plan,
}: {
  plan?: DatePlan & { version?: number };
}) {
  const { saveRecord, ready, pending } = usePlanning();
  const [id, setId] = useState(() => plan?.id || crypto.randomUUID());
  return (
    <Editor
      title={plan ? "แก้ไขแผนเดต" : "วางแผนเดต"}
      schema={dateSchema.omit({ id: true }).extend({
        budget: bahtSchema,
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        version: z.number().int().nonnegative(),
      })}
      disabled={!ready || pending}
      values={
        plan
          ? { ...plan, version: plan.version || 1 }
          : {
              title: "",
              place: "",
              day: today(),
              time: "17:00",
              budget: 500,
              version: 0,
            }
      }
      trigger={plan ? <Pencil size={16} /> : undefined}
      fields={[
        { name: "title", label: "ชื่อเดตของเรา" },
        { name: "place", label: "สถานที่" },
        { name: "day", label: "วันที่", type: "date" },
        { name: "time", label: "เวลา", type: "time" },
        {
          name: "budget",
          label: "งบประมาณ (บาท)",
          type: "number",
          min: 0,
          step: "0.01",
        },
      ]}
      onSave={async (data) => {
        const ok = await saveRecord({
          kind: "date",
          id,
          title: data.title,
          place: data.place,
          day: data.day,
          time: data.time,
          budget_cents: Math.round(data.budget * 100),
          version: data.version,
        });
        if (ok && !plan) setId(crypto.randomUUID());
        return ok;
      }}
    />
  );
}
export function DatesTool() {
  const { dates, remove, ready } = usePlanning();
  return (
    <>
      <QuestStatus label="แผนเดต" ready={ready} />
      <SectionTitle title="ให้เวลาที่ดีมีเราสองคน" action={<DateEditor />} />
      <div className="tool-card-grid">
        {[...dates]
          .sort((a, b) =>
            `${a.day}${a.time}`.localeCompare(`${b.day}${b.time}`),
          )
          .map((d) => (
            <section className="panel date-plan" key={d.id}>
              <div className="date-art">
                <Coffee size={52} />
                <span>YOU, ME & A LITTLE TIME</span>
              </div>
              <div className="between">
                <span className="tag">
                  {d.day >= today() ? "รอวันของเรา" : "นัดที่ผ่านมา"}
                </span>
                <div className="row-actions">
                  <DateEditor plan={d} />
                  <DeleteButton
                    label="แผนเดต"
                    onDelete={() => remove("date", d.id)}
                  />
                </div>
              </div>
              <h2>{d.title}</h2>
              <p className="muted inline">
                <MapPin size={16} />
                {d.place}
              </p>
              <p className="muted inline">
                <CalendarDays size={16} />
                {dateLabel(d.day)} · {d.time} น.
              </p>
              <p className="plan-budget">
                งบของเรา <strong>฿{money(d.budget)}</strong>
              </p>
            </section>
          ))}
      </div>
      {ready && !dates.length && (
        <Empty>เลือกวันว่าง แล้วสร้างเดตแรกของเรา</Empty>
      )}
    </>
  );
}
export function WishlistTool() {
  const { wishes, saveRecord, remove, ready, pending } = usePlanning();
  const [filter, setFilter] = useState("ทั้งหมด");
  const list = wishes.filter(
    (w) => filter === "ทั้งหมด" || w.category === filter,
  );
  return (
    <>
      <QuestStatus label="Wishlist" ready={ready} />
      <SectionTitle title="สักวัน เราจะไปด้วยกัน" action={<WishEditor />} />
      <div className="segmented">
        {["ทั้งหมด", "สถานที่", "ร้านอาหาร", "สิ่งของ"].map((t) => (
          <button
            className={filter === t ? "active" : ""}
            aria-pressed={filter === t}
            onClick={() => setFilter(t)}
            key={t}
          >
            {t}
          </button>
        ))}
      </div>
      <section className="panel">
        {list.length
          ? list.map((w) => (
              <div className="quest-row" key={w.id}>
                <button
                  className={`quest-check ${w.done ? "checked" : ""}`}
                  aria-label={`${w.done ? "ยกเลิกสำเร็จ" : "ทำสำเร็จ"}: ${w.title}`}
                  disabled={!ready || pending}
                  onClick={() =>
                    void saveRecord({
                      kind: "wish",
                      id: w.id,
                      title: w.title,
                      category: w.category,
                      done: !w.done,
                      version: w.version,
                    })
                  }
                >
                  {w.done && <Check size={16} />}
                </button>
                <div className={`quest-copy ${w.done ? "struck" : ""}`}>
                  <strong>{w.title}</strong>
                  <p>{w.category}</p>
                </div>
                <WishEditor wish={w} />
                <DeleteButton
                  label="Wishlist"
                  onDelete={() => remove("wish", w.id)}
                />
              </div>
            ))
          : ready && <Empty>เติมไอเดียเล็ก ๆ ไว้ทำด้วยกัน</Empty>}
      </section>
    </>
  );
}
function WishEditor({
  wish,
}: {
  wish?: World["wishes"][number] & { version?: number };
}) {
  const { saveRecord, ready, pending } = usePlanning();
  const [id, setId] = useState(() => wish?.id || crypto.randomUUID());
  return (
    <Editor
      title={wish ? "แก้ไข Wishlist" : "เพิ่ม Wishlist"}
      disabled={!ready || pending}
      schema={wishSchema
        .omit({ id: true })
        .extend({ version: z.number().int().nonnegative() })}
      values={
        wish
          ? { ...wish, version: wish.version || 1 }
          : { title: "", category: "สถานที่", done: false, version: 0 }
      }
      fields={[
        { name: "title", label: "สิ่งที่อยากทำด้วยกัน" },
        {
          name: "category",
          label: "หมวดหมู่",
          type: "select",
          options: ["สถานที่", "ร้านอาหาร", "สิ่งของ"],
        },
      ]}
      trigger={wish ? <Pencil size={16} /> : undefined}
      onSave={async (data) => {
        const ok = await saveRecord({ kind: "wish", id, ...data });
        if (ok && !wish) setId(crypto.randomUUID());
        return ok;
      }}
    />
  );
}
function EventEditor({ day }: { day: string }) {
  const { saveRecord, ready, pending } = usePlanning();
  const [id, setId] = useState(() => crypto.randomUUID());
  return (
    <Editor
      title="เพิ่มกิจกรรม"
      disabled={!ready || pending}
      schema={eventSchema.omit({ id: true })}
      values={{ title: "", day, kind: "กิจกรรม" }}
      fields={[
        { name: "title", label: "ชื่อกิจกรรม" },
        { name: "day", label: "วันที่", type: "date" },
        {
          name: "kind",
          label: "ประเภท",
          type: "select",
          options: ["กิจกรรม", "วันสำคัญ", "วันครบรอบ"],
        },
      ]}
      onSave={async (data) => {
        const ok = await saveRecord({
          kind: "event",
          id,
          title: data.title,
          day: data.day,
          event_kind: data.kind,
          version: 0,
        });
        if (ok) setId(crypto.randomUUID());
        return ok;
      }}
    />
  );
}
export function CalendarTool() {
  const { dates: plans, events, profile, remove, ready } = usePlanning();
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [selected, setSelected] = useState(today());
  const [year, mon] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const start = (new Date(Date.UTC(year, mon - 1, 1)).getUTCDay() + 6) % 7;
  const dates = plans.map((d) => ({
    id: d.id,
    title: d.title,
    day: d.day,
    kind: "เดต",
  }));
  const anniversary = {
    id: "anniversary",
    title: "วันครบรอบของเรา",
    day: anniversaryDay(profile.since, year),
    kind: "วันครบรอบ",
  };
  const all = ready ? [...events, ...dates, anniversary] : [];
  function changeMonth(offset: number) {
    const d = new Date(Date.UTC(year, mon - 1 + offset, 1));
    setMonth(d.toISOString().slice(0, 7));
    setSelected(d.toISOString().slice(0, 10));
  }
  return (
    <>
      <QuestStatus label="ปฏิทิน" ready={ready} />
      <SectionTitle
        title="จองวันดี ๆ ให้กัน"
        action={<EventEditor day={selected} />}
      />
      <div className="calendar-layout">
        <section className="panel">
          <div className="between">
            <Button
              variant="ghost"
              size="icon"
              aria-label="เดือนก่อน"
              onClick={() => changeMonth(-1)}
            >
              <ChevronLeft />
            </Button>
            <h2>
              {new Intl.DateTimeFormat("th-TH", {
                month: "long",
                year: "numeric",
                timeZone: "Asia/Bangkok",
              }).format(new Date(`${month}-15T12:00:00+07:00`))}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label="เดือนถัดไป"
              onClick={() => changeMonth(1)}
            >
              <ChevronRight />
            </Button>
          </div>
          <div className="calendar-grid">
            {["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"].map((d) => (
              <span className="weekday" key={d}>
                {d}
              </span>
            ))}
            {Array.from({ length: start }, (_, i) => (
              <span key={`blank${i}`} />
            ))}
            {Array.from({ length: count }, (_, i) => {
              const d = `${month}-${String(i + 1).padStart(2, "0")}`;
              return (
                <button
                  key={d}
                  onClick={() => setSelected(d)}
                  aria-label={dateLabel(d)}
                  aria-pressed={selected === d}
                  className={`${selected === d ? "selected" : ""} ${d === today() ? "today" : ""}`}
                >
                  {i + 1}
                  {all.some((e) => e.day === d) && <i />}
                </button>
              );
            })}
          </div>
          <p className="muted text-sm">
            จุดสีชมพู = มีนัดหรือวันสำคัญ · วันครบรอบแสดงทุกปี
          </p>
        </section>
        <section className="panel">
          <h2>{dateLabel(selected)}</h2>
          {all
            .filter((e) => e.day === selected)
            .map((e) => (
              <div className="history-row" key={e.id}>
                <CalendarDays size={18} />
                <div>
                  <strong>{e.title}</strong>
                  <p className="muted text-sm">{e.kind}</p>
                </div>
                {events.some((item) => item.id === e.id) && (
                  <DeleteButton
                    label="กิจกรรม"
                    onDelete={() => remove("event", e.id)}
                  />
                )}
              </div>
            ))}
          {ready && !all.some((e) => e.day === selected) && (
            <Empty>วันนี้ยังว่าง เติมนัดน่ารัก ๆ ได้เลย</Empty>
          )}
        </section>
      </div>
    </>
  );
}
