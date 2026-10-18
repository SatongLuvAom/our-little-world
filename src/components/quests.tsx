"use client";
import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Check,
  Pencil,
  Heart,
  Utensils,
  HandHeart,
  Film,
  Trophy,
  History,
} from "lucide-react";
import { usePendingReward, useQuests } from "@/lib/quest-store";
import { questSchema, rewards, type Quest } from "@/lib/model";
import { today, dateLabel } from "@/lib/utils";
import { Button } from "./ui/button";
import { Sheet } from "./ui/dialog";
import {
  DeleteButton,
  Editor,
  Empty,
  Hearts,
  PageHeading,
  SectionTitle,
  type Field,
} from "./shared";
const fields: Field[] = [
  { name: "title", label: "ชื่อภารกิจ" },
  {
    name: "owner",
    label: "ผู้รับผิดชอบ",
    type: "select",
    options: ["ด้วยกัน", "เรา", "เธอ"],
  },
  { name: "due", label: "วันครบกำหนด", type: "date" },
  {
    name: "repeat",
    label: "ทำซ้ำ",
    type: "select",
    options: ["ครั้งเดียว", "รายวัน", "รายสัปดาห์"],
  },
  {
    name: "hearts",
    label: "หัวใจรางวัล (1–500)",
    type: "number",
    min: 1,
    max: 500,
  },
];
function RedeemButton({ reward }: { reward: (typeof rewards)[number] }) {
  const { wallet, redeem, ready, pending } = useQuests();
  const previousRequest = usePendingReward(reward.id);
  const [open, setOpen] = useState(false);
  const requestId = useRef("");
  return (
    <>
      <Button
        variant="secondary"
        disabled={
          !ready || pending || (!previousRequest && wallet < reward.cost)
        }
        onClick={() => {
          requestId.current = crypto.randomUUID();
          setOpen(true);
        }}
      >
        <Heart size={15} />
        {reward.cost} · {previousRequest ? "ตรวจสอบรายการเดิม" : "แลกรางวัล"}
      </Button>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
        title={`แลก${reward.title}`}
        description={
          previousRequest
            ? "ส่งคำขอเดิมอีกครั้ง ระบบจะไม่หักหัวใจซ้ำหากบันทึกไปแล้ว"
            : `ใช้ ${reward.cost} หัวใจ จากที่มี ${wallet} หัวใจ`
        }
      >
        <Button
          disabled={pending || !ready}
          onClick={async () => {
            if (await redeem(reward.id, requestId.current)) setOpen(false);
          }}
        >
          ยืนยันแลกรางวัล
        </Button>
      </Sheet>
    </>
  );
}
export function QuestEditor({ quest }: { quest?: Quest }) {
  const { save, state, ready, pending, demo, profile } = useQuests();
  const [id, setId] = useState(() => quest?.id || crypto.randomUUID());
  const version = quest
    ? demo
      ? 1
      : state?.quests.find((q) => q.id === quest.id)?.version || 1
    : 0;
  return (
    <Editor
      title={quest ? "แก้ไขภารกิจ" : "เพิ่มภารกิจ"}
      schema={questSchema.omit({ id: true })}
      disabled={!ready || pending}
      description={
        demo
          ? undefined
          : "ทำสำเร็จแล้วจะเก็บหัวใจและประวัติไว้เสมอ เปลี่ยนชนิดรอบได้เฉพาะภารกิจที่ยังไม่เคยรับหัวใจ"
      }
      values={
        quest || {
          title: "",
          owner: "ด้วยกัน",
          due: today(),
          repeat: "ครั้งเดียว",
          hearts: 20,
        }
      }
      fields={fields.map((field) =>
        field.name !== "owner" || demo
          ? field
          : {
              ...field,
              options: [
                { value: "ด้วยกัน", label: "เราสองคน" },
                { value: "เรา", label: profile.name1 },
                ...(state?.couple.members[1]
                  ? [{ value: "เธอ", label: profile.name2 }]
                  : []),
              ],
            },
      )}
      trigger={quest ? <Pencil size={16} /> : undefined}
      onSave={async (data) => {
        const ok = await save({ ...data, id }, version);
        if (ok && !quest) setId(crypto.randomUUID());
        return ok;
      }}
    />
  );
}
export function QuestList({
  limit,
  editable = false,
}: {
  limit?: number;
  editable?: boolean;
}) {
  const { quests, profile, day, isDone, complete, remove, canComplete, ready } =
    useQuests();
  const [burst, setBurst] = useState<string | null>(null);
  if (!ready && !quests.length) return null;
  const list = limit
    ? quests.filter((q) => !isDone(q) && q.due <= day).slice(0, limit)
    : quests;
  if (!list.length)
    return <Empty>ภารกิจครบแล้ว เก่งมากทั้งสองคน! เติมภารกิจใหม่ได้เลย</Empty>;
  return (
    <div className="quest-list">
      {list.map((q) => {
        const done = isDone(q);
        return (
          <div className={`quest-row ${done ? "quest-done" : ""}`} key={q.id}>
            <button
              className="quest-check"
              aria-label={`ทำสำเร็จ: ${q.title}`}
              disabled={done || !canComplete(q)}
              title={
                !done && !canComplete(q)
                  ? "รอวันครบกำหนดหรือให้ผู้รับผิดชอบทำภารกิจ"
                  : undefined
              }
              onClick={async () => {
                if (await complete(q)) setBurst(q.id);
              }}
            >
              {done && <Check size={17} />}
            </button>
            <div className="quest-copy">
              <strong>{q.title}</strong>
              <p>
                <span
                  className={`owner-dot ${q.owner === "เธอ" ? "mint-dot" : ""}`}
                />
                {q.owner === "เรา"
                  ? profile.name1
                  : q.owner === "เธอ"
                    ? profile.name2
                    : "เราสองคน"}
                <span>·</span>
                {q.repeat === "ครั้งเดียว" ? dateLabel(q.due) : q.repeat}
              </p>
            </div>
            <span className="quest-points">
              +{q.hearts}
              <Heart size={13} />
            </span>
            {editable && ready && (
              <div className="row-actions">
                <QuestEditor quest={q} />
                <DeleteButton label="ภารกิจ" onDelete={() => remove(q.id)} />
              </div>
            )}
            {burst === q.id && (
              <span
                className="heart-burst"
                key={q.id}
                onAnimationEnd={() => setBurst(null)}
                aria-hidden="true"
              >
                ♡ ✦ ♡
                <span className="confetti">
                  {Array.from({ length: 10 }, (_, i) => (
                    <i
                      key={i}
                      style={
                        {
                          "--x": `${(i - 5) * 14}px`,
                          "--r": `${i * 71}deg`,
                          background: [
                            "#EFA9AD",
                            "#BFE5D7",
                            "#FFD9AB",
                            "#DDD0F4",
                          ][i % 4],
                        } as React.CSSProperties
                      }
                    />
                  ))}
                </span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
export function QuestsPage() {
  const {
    wallet,
    completionCount,
    catalog,
    redemptions,
    entries,
    state,
    demo,
    loadMore,
    pending,
  } = useQuests();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(() =>
    searchParams.get("tab") === "rewards" ? "ร้านรางวัล" : "ภารกิจ",
  );
  return (
    <>
      <QuestStatus />
      <PageHeading
        eyebrow="LITTLE STEPS, TOGETHER"
        title="ภารกิจของเรา"
        description="เปลี่ยนเรื่องเล็ก ๆ ให้เป็นความใส่ใจในทุกวัน"
        action={<QuestEditor />}
      />
      <div className="summary-strip">
        <div>
          <span className="icon-tile pink">
            <Heart />
          </span>
          <div>
            <small>หัวใจที่ใช้ได้</small>
            <strong>
              {wallet} <em>ดวง</em>
            </strong>
          </div>
        </div>
        <div>
          <span className="icon-tile mint">
            <Check />
          </span>
          <div>
            <small>ทำสำเร็จด้วยกัน</small>
            <strong>
              {completionCount} <em>ครั้ง</em>
            </strong>
          </div>
        </div>
        <div>
          <span className="icon-tile lavender">
            <Trophy />
          </span>
          <div>
            <small>ความสำเร็จ</small>
            <strong>
              {completionCount >= 1 ? "ก้าวแรกของเรา" : "รอก้าวแรกของเรา"}
            </strong>
          </div>
        </div>
      </div>
      <div className="segmented">
        {["ภารกิจ", "ร้านรางวัล", "ประวัติ"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "ภารกิจ" && (
        <section className="panel">
          <SectionTitle
            title="ทีละนิด ก็ใกล้กันมากขึ้น"
            detail="รายวันเริ่มรอบใหม่เที่ยงคืน • รายสัปดาห์เริ่มวันจันทร์ (เวลาไทย)"
          />
          <QuestList editable />
        </section>
      )}
      {tab === "ร้านรางวัล" && (
        <div className="reward-grid">
          {catalog.map((r, i) => {
            const Icon =
              r.icon === "dinner"
                ? Utensils
                : r.icon === "movie"
                  ? Film
                  : HandHeart;
            return (
              <section className="panel reward-card" key={r.id}>
                <span className={`reward-art art-${i}`}>
                  <Icon size={42} />
                </span>
                <h2>{r.title}</h2>
                <p className="muted">{r.detail}</p>
                <RedeemButton reward={r} />
              </section>
            );
          })}
          <section className="panel">
            <SectionTitle title="คูปองที่แลกแล้ว" />
            {redemptions.length ? (
              redemptions.map((r) => (
                <div className="history-row" key={r.id}>
                  <HandHeart size={18} />
                  <div>
                    <strong>{r.title}</strong>
                    <p className="muted">
                      {dateLabel(r.at)} · {r.cost} หัวใจ
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <Empty>คูปองสำหรับช่วงเวลาดี ๆ จะอยู่ตรงนี้</Empty>
            )}
          </section>
          {!demo && state?.history.nextCursor && (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => void loadMore()}
            >
              โหลดประวัติเพิ่ม
            </Button>
          )}
        </div>
      )}
      {tab === "ประวัติ" && (
        <section className="panel">
          <SectionTitle title="ทุกความใส่ใจมีความหมาย" />
          {entries.map((t) => (
            <div key={t.id} className="history-row">
              <History size={18} />
              <div>
                <strong>
                  {t.amount < 0 && t.category !== "pet" ? "แลก " : ""}
                  {t.title}
                </strong>
                <p className="muted">
                  {dateLabel(new Date(t.created_at).toISOString())}
                </p>
              </div>
              <Hearts value={t.amount} />
            </div>
          ))}
          {!entries.length && <Empty>เริ่มทำภารกิจเพื่อสะสมหัวใจร่วมกัน</Empty>}
          {!demo && state?.history.nextCursor && (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => void loadMore()}
            >
              โหลดประวัติเพิ่ม
            </Button>
          )}
        </section>
      )}
    </>
  );
}
export function QuestStatus({
  label = "Quest / Rewards / หัวใจ",
  ready = true,
}: { label?: string; ready?: boolean } = {}) {
  const { status, error, refresh, pending, online } = useQuests();
  if (!online)
    return (
      <p role="status" className="notice">
        ออฟไลน์ · ดูข้อมูลเดิมได้ เชื่อมต่อก่อนบันทึกหรือยืนยันยอด
      </p>
    );
  if (status === "loading" || (status === "paired" && !ready))
    return (
      <p role="status" className="notice">
        กำลังตรวจสอบข้อมูลของบัญชี…
      </p>
    );
  if (status === "demo")
    return (
      <p className="notice">
        {label} ตัวอย่างในเครื่อง ·{" "}
        <Link href="/login" className="text-link">
          เข้าสู่ระบบเพื่อใช้ร่วมกัน
        </Link>
      </p>
    );
  if (status === "unpaired")
    return (
      <p className="notice">
        สร้างคู่หรือรับคำเชิญก่อนเริ่มใช้ข้อมูลร่วมกัน ·{" "}
        <Link href="/pairing" className="text-link">
          ไปจับคู่บัญชี
        </Link>
      </p>
    );
  return (
    <div
      className={error ? "error-banner" : "notice"}
      role={error ? "alert" : undefined}
    >
      <span>
        {error || `${label} ใช้ร่วมกันสองคน · ซิงก์ทุก 30 วินาทีเมื่อเปิดแอป`}
      </span>{" "}
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() => void refresh(true)}
      >
        โหลดข้อมูลล่าสุด
      </Button>
      {error && (
        <Link href="/login" className="text-link">
          เข้าสู่ระบบอีกครั้ง
        </Link>
      )}
    </div>
  );
}
