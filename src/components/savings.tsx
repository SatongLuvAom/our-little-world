"use client";
import { useState } from "react";
import { z } from "zod";
import { PiggyBank, ArrowUpRight, Pencil, RotateCcw } from "lucide-react";
import { usePendingDeposit, usePlanning } from "@/lib/planning-store";
import { goalSchema, type Goal } from "@/lib/model";
import { targetBahtSchema } from "@/lib/planning-schema";
import { QuestStatus } from "./quests";
import { Button } from "./ui/button";
import { today, money, dateLabel } from "@/lib/utils";
import { Editor, Empty, PageHeading, Progress, SectionTitle } from "./shared";
export function GoalEditor({ goal }: { goal?: Goal & { version?: number } }) {
  const { saveRecord, ready, pending } = usePlanning();
  const [id, setId] = useState(() => goal?.id || crypto.randomUUID());
  return (
    <Editor
      title={goal ? "แก้ไขเป้าหมาย" : "สร้างเป้าหมาย"}
      schema={goalSchema.omit({ id: true }).extend({
        target: targetBahtSchema,
        version: z.number().int().nonnegative(),
      })}
      disabled={!ready || pending}
      values={
        goal
          ? { ...goal, version: goal.version || 1 }
          : { title: "", target: 10000, due: today(), version: 0 }
      }
      trigger={goal ? <Pencil size={16} /> : undefined}
      fields={[
        { name: "title", label: "เราอยากเก็บเงินเพื่ออะไร" },
        {
          name: "target",
          label: "ยอดเป้าหมาย (บาท)",
          type: "number",
          min: 0.01,
          step: "0.01",
        },
        { name: "due", label: "วันที่ตั้งใจเก็บให้ครบ", type: "date" },
      ]}
      onSave={async (data) => {
        const ok = await saveRecord({
          id,
          kind: "goal",
          title: data.title,
          target_cents: Math.round(data.target * 100),
          due: data.due,
          version: data.version,
        });
        if (ok && !goal) setId(crypto.randomUUID());
        return ok;
      }}
    />
  );
}
const depositSchema = z.object({
  amount: z
    .number()
    .positive("ใส่ยอดมากกว่า 0 บาท")
    .max(10000000)
    .multipleOf(0.01, "ระบุทศนิยมไม่เกิน 2 ตำแหน่ง"),
  person: z.enum(["เรา", "เธอ"]),
  note: z.string().max(200),
});
export function DepositEditor({ goal }: { goal: Goal }) {
  const { deposit, demoDeposit, demo, members, ready, pending, state } =
    usePlanning();
  const savedRequest = usePendingDeposit(goal.id);
  const [id, setId] = useState(() => crypto.randomUUID());
  return (
    <div>
      <Editor
        title="บันทึกเงินออม"
        description={`บันทึกยอดสำหรับ ${goal.title} · ไม่มีการรับหรือโอนเงินจริง`}
        schema={depositSchema}
        disabled={!ready || pending || !!savedRequest}
        values={{
          amount: 100,
          person: demo || members[0]?.id === state?.actor_id ? "เรา" : "เธอ",
          note: "",
        }}
        fields={[
          {
            name: "amount",
            label: "ยอดที่ออม (บาท)",
            type: "number",
            min: 0.01,
            step: "0.01",
          },
          {
            name: "person",
            label: "ใครเป็นคนออม",
            type: "select",
            options: demo
              ? ["เรา", "เธอ"]
              : members.map((m, i) => ({
                  value: i ? "เธอ" : "เรา",
                  label: m.name,
                })),
          },
          { name: "note", label: "บันทึกช่วยจำ" },
        ]}
        onSave={async (data) => {
          const ok = demo
            ? demoDeposit(goal.id, data)
            : await deposit({
                id,
                goal_id: goal.id,
                contributor_id: members[data.person === "เรา" ? 0 : 1].id,
                amount_cents: Math.round(data.amount * 100),
                note: data.note,
              });
          if (ok) setId(crypto.randomUUID());
          return ok;
        }}
      />
      {savedRequest && (
        <div className="editor-form">
          <p className="muted text-sm">
            มีรายการออม ฿{money(savedRequest.amount_cents / 100)} รอยืนยัน
            ตรวจสอบรายการเดิมก่อนเริ่มใหม่
          </p>
          <Button
            variant="secondary"
            disabled={pending || !ready}
            onClick={() => void deposit(savedRequest)}
          >
            ตรวจสอบรายการออมเดิม
          </Button>
        </div>
      )}
    </div>
  );
}
export function SavingsPage() {
  const {
    goals,
    profile,
    contribution,
    demo,
    history,
    demoHistory,
    personName,
    reverse,
    loadSavingsMore,
    pending,
    ready,
  } = usePlanning();
  const entries = demo
    ? demoHistory.map((t) => ({
        id: t.id,
        goal_id: t.goalId,
        goal_title:
          goals.find((g) => g.id === t.goalId)?.title || "เป้าหมายเดิม",
        actor_id: t.person,
        contributor_id: t.person,
        kind: "deposit" as const,
        amount_cents: Math.round(t.amount * 100),
        note: t.note,
        created_at: Date.parse(t.at),
        reversed: false,
      }))
    : history.entries;
  const displayName = (id: string) =>
    demo ? (id === "เรา" ? profile.name1 : profile.name2) : personName(id);
  return (
    <>
      <QuestStatus label="เงินออม" ready={ready} />
      <PageHeading
        eyebrow="SAVING FOR OUR SOMEDAY"
        title="กระปุกความฝัน"
        description="ค่อย ๆ เก็บ เพื่อวันที่ได้ไปด้วยกัน"
        action={<GoalEditor />}
      />
      <div className="notice">
        <PiggyBank size={18} />
        สมุดบันทึกยอดออมของเรา ไม่มีการรับ โอน หรือเก็บเงินจริง
      </div>
      <div className="savings-grid">
        {goals.map((g) => {
          const total = g.total_cents / 100;
          return (
            <section className="panel goal-card" key={g.id}>
              <div className="goal-top">
                <span className="icon-tile mint">
                  <PiggyBank />
                </span>
                <GoalEditor goal={g} />
              </div>
              <p className="eyebrow">OUR LITTLE DREAM</p>
              <h2>{g.title}</h2>
              <div className="goal-amount">
                ฿{money(total)} <span>/ ฿{money(g.target)}</span>
              </div>
              <Progress value={(total / g.target) * 100} label={g.title} />
              <div className="between muted text-sm">
                <span>{Math.round((total / g.target) * 100)}% ของความฝัน</span>
                <span>{dateLabel(g.due)}</span>
              </div>
              <div className="contributions">
                {(["เรา", "เธอ"] as const).map((p, i) => (
                  <div key={p}>
                    <span className={`avatar avatar-${i}`}>
                      {(i ? profile.name2 : profile.name1).slice(0, 1)}
                    </span>
                    <span>
                      {i ? profile.name2 : profile.name1}
                      <strong>฿{money(contribution(g.id, i) / 100)}</strong>
                    </span>
                  </div>
                ))}
              </div>
              <DepositEditor goal={g} />
            </section>
          );
        })}
        {ready && !goals.length && (
          <Empty>เริ่มความฝันแรกด้วยการสร้างเป้าหมาย</Empty>
        )}
      </div>
      {ready && (
        <section className="panel">
          <SectionTitle
            title="ทีละเล็ก ทีละน้อย"
            detail={
              demo
                ? "ประวัติการบันทึกเงินออมทั้งหมด · เก็บรายการเดิมไว้ตรวจสอบย้อนหลัง"
                : "รายการผิดให้หักล้าง แล้วบันทึกยอดใหม่ · ประวัติเดิมยังอยู่"
            }
          />
          {entries.map((t) => (
            <div className="history-row" key={t.id}>
              <span className="icon-tile mint small-tile">
                <ArrowUpRight size={18} />
              </span>
              <div>
                <strong>
                  {displayName(t.contributor_id)} · {t.goal_title}
                </strong>
                <p className="muted text-sm">
                  {dateLabel(new Date(t.created_at).toISOString())}
                  {t.note ? ` · ${t.note}` : ""}
                  {t.actor_id !== t.contributor_id
                    ? ` · บันทึกโดย ${displayName(t.actor_id)}`
                    : ""}
                  {t.kind === "reversal"
                    ? " · รายการหักล้าง"
                    : t.reversed
                      ? " · หักล้างแล้ว"
                      : ""}
                </p>
              </div>
              <strong className={t.amount_cents > 0 ? "green" : ""}>
                {t.amount_cents > 0 ? "+" : "−"}฿
                {money(Math.abs(t.amount_cents) / 100)}
              </strong>
              {!demo && t.kind === "deposit" && !t.reversed && (
                <Editor
                  title="หักล้างรายการออม"
                  trigger={<RotateCcw size={16} />}
                  disabled={!ready || pending}
                  description={`หักล้างยอด ฿${money(t.amount_cents / 100)} ทั้งรายการ ประวัติเดิมยังอยู่ หากยอดผิดให้บันทึกรายการใหม่หลังหักล้าง`}
                  schema={z.object({
                    note: z.string().trim().min(1, "ระบุเหตุผลก่อนนะ").max(200),
                  })}
                  values={{ note: "" }}
                  fields={[{ name: "note", label: "เหตุผลที่หักล้าง" }]}
                  onSave={(data) => reverse(t.id, data.note)}
                />
              )}
            </div>
          ))}
          {ready && !entries.length && (
            <Empty>เริ่มบันทึกเงินออมก้อนแรกของเรา</Empty>
          )}
          {!demo && history.nextCursor && (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => void loadSavingsMore()}
            >
              โหลดประวัติเงินออมเพิ่ม
            </Button>
          )}
        </section>
      )}
    </>
  );
}
