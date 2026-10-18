"use client";
import { pendingStorage } from "@/lib/client-safety";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useQuests } from "./quest-store";
import { useWorld } from "./world-store";
import {
  depositSchema,
  type Deposit,
  type PlanningRecord,
} from "./planning-schema";
import type { Goal } from "./model";
const pendingKey = (couple: string, goal: string) =>
  `olw:pending-deposit:${couple}:${goal}`;
function subscribePending(listener: () => void) {
  window.addEventListener("olw-deposit-pending", listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("olw-deposit-pending", listener);
    window.removeEventListener("storage", listener);
  };
}
export function usePendingDeposit(goal: string) {
  const { state } = useQuests();
  const raw = useSyncExternalStore(
    subscribePending,
    () => {
      try {
        return state
          ? pendingStorage.getItem(pendingKey(state.couple.id, goal))
          : null;
      } catch {
        return null;
      }
    },
    () => null,
  );
  if (!raw) return null;
  try {
    return depositSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}
export function usePlanning() {
  const shared = useQuests(),
    { world, update } = useWorld();
  const { state, demo, mutate } = shared,
    data = state?.planning;
  const members = state?.couple.members || [];
  const goals: (Goal & {
    version: number;
    total_cents: number;
    contributions: Record<string, number>;
  })[] = demo
    ? world.goals.map((g) => ({
        ...g,
        version: 1,
        total_cents: Math.round(
          world.deposits
            .filter((d) => d.goalId === g.id)
            .reduce((s, d) => s + d.amount, 0) * 100,
        ),
        contributions: {
          เรา: Math.round(
            world.deposits
              .filter((d) => d.goalId === g.id && d.person === "เรา")
              .reduce((s, d) => s + d.amount, 0) * 100,
          ),
          เธอ: Math.round(
            world.deposits
              .filter((d) => d.goalId === g.id && d.person === "เธอ")
              .reduce((s, d) => s + d.amount, 0) * 100,
          ),
        },
      }))
    : (data?.goals || []).map((g) => ({ ...g, target: g.target_cents / 100 }));
  const dates = demo
    ? world.dates.map((d) => ({ ...d, version: 1 }))
    : (data?.dates || []).map((d) => ({ ...d, budget: d.budget_cents / 100 }));
  const wishes = demo
    ? world.wishes.map((w) => ({ ...w, version: 1 }))
    : data?.wishes || [];
  const events = demo
    ? world.events.map((e) => ({ ...e, version: 1 }))
    : (data?.events || []).map((e) => ({ ...e, kind: e.event_kind }));
  async function saveRecord(record: PlanningRecord) {
    if (!demo) return mutate("save", record, "บันทึกแล้ว", "planning");
    const { kind, id, version } = record;
    return update((s) => {
      if (kind === "goal") {
        const row = {
          id,
          title: record.title,
          due: record.due,
          target: record.target_cents / 100,
        };
        return {
          ...s,
          goals: version
            ? s.goals.map((g) => (g.id === id ? row : g))
            : [...s.goals, row],
        };
      }
      if (kind === "date") {
        const row = {
          id,
          title: record.title,
          place: record.place,
          day: record.day,
          time: record.time,
          budget: record.budget_cents / 100,
        };
        return {
          ...s,
          dates: version
            ? s.dates.map((d) => (d.id === id ? row : d))
            : [...s.dates, row],
        };
      }
      if (kind === "wish") {
        const row = {
          id,
          title: record.title,
          category: record.category,
          done: record.done,
        };
        return {
          ...s,
          wishes: version
            ? s.wishes.map((w) => (w.id === id ? row : w))
            : [...s.wishes, row],
        };
      }
      const row = {
        id,
        title: record.title,
        day: record.day,
        kind: record.event_kind,
      };
      return {
        ...s,
        events: version
          ? s.events.map((e) => (e.id === id ? row : e))
          : [...s.events, row],
      };
    }, "บันทึกแล้ว");
  }
  function remove(kind: "date" | "wish" | "event", id: string) {
    if (!demo)
      return mutate("delete", { kind, id }, "ลบรายการแล้ว", "planning");
    const field = { date: "dates", wish: "wishes", event: "events" } as const;
    return update(
      (s) => ({
        ...s,
        [field[kind]]: s[field[kind]].filter((item) => item.id !== id),
      }),
      "ลบรายการแล้ว",
    );
  }
  async function deposit(input: Deposit) {
    if (!shared.ready || shared.pending) return false;
    if (demo) return false;
    if (!state) return false;
    const key = pendingKey(state.couple.id, input.goal_id);
    try {
      const entry = depositSchema.parse(input),
        raw = pendingStorage.getItem(key);
      if (
        raw &&
        JSON.stringify(depositSchema.parse(JSON.parse(raw))) !==
          JSON.stringify(entry)
      )
        throw Error(
          "มีรายการออมค้างอยู่ ปิดแบบฟอร์มแล้วตรวจสอบรายการเดิมก่อนเริ่มใหม่",
        );
      pendingStorage.setItem(key, JSON.stringify(entry));
      window.dispatchEvent(new Event("olw-deposit-pending"));
      const ok = await mutate(
        "deposit",
        entry,
        "บันทึกเงินออมแล้ว",
        "planning",
        (status) => {
          if ([400, 403, 404].includes(status)) {
            pendingStorage.removeItem(key);
            window.dispatchEvent(new Event("olw-deposit-pending"));
          }
        },
      );
      if (ok) {
        pendingStorage.removeItem(key);
        window.dispatchEvent(new Event("olw-deposit-pending"));
      }
      return ok;
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "เก็บรายการออมค้างไม่ได้ กรุณาตรวจสิทธิ์พื้นที่จัดเก็บ",
      );
      return false;
    }
  }
  function demoDeposit(
    goalId: string,
    input: { amount: number; person: "เรา" | "เธอ"; note: string },
  ) {
    return update(
      (s) => ({
        ...s,
        deposits: [
          {
            ...input,
            id: crypto.randomUUID(),
            goalId,
            at: new Date().toISOString(),
            amount: Math.round(input.amount * 100) / 100,
          },
          ...s.deposits,
        ],
      }),
      "เก็บความฝันเพิ่มอีกนิดแล้ว",
    );
  }
  return {
    ...shared,
    ready: shared.ready && (demo || !!data),
    goals,
    dates,
    wishes,
    events,
    members,
    history: data?.history || { entries: [], nextCursor: null },
    demoHistory: world.deposits,
    saveRecord,
    remove,
    deposit,
    demoDeposit,
    reverse: (entry_id: string, note: string) =>
      mutate(
        "reverse",
        { id: crypto.randomUUID(), entry_id, note },
        "หักล้างรายการเดิมแล้ว ประวัติยังอยู่",
        "planning",
      ),
    loadSavingsMore: () => shared.loadMore("planning"),
    personName: (id: string) => members.find((m) => m.id === id)?.name || id,
    contribution: (goalId: string, index: number) =>
      goals.find((g) => g.id === goalId)?.contributions[
        demo ? (index ? "เธอ" : "เรา") : members[index]?.id
      ] || 0,
  };
}
