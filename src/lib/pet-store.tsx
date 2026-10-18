"use client";
import { pendingStorage } from "@/lib/client-safety";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useQuests } from "./quest-store";
import { useWorld } from "./world-store";
import { spend } from "./model";
const key = (couple: string, operation: string) =>
  `olw:pending-pet:${couple}:${operation}`;
function subscribe(listener: () => void) {
  window.addEventListener("olw-pet-pending", listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("olw-pet-pending", listener);
    window.removeEventListener("storage", listener);
  };
}
export function usePendingPet(operation: string) {
  const { state } = useQuests();
  return useSyncExternalStore(
    subscribe,
    () => {
      try {
        return state
          ? pendingStorage.getItem(key(state.couple.id, operation))
          : null;
      } catch {
        return null;
      }
    },
    () => null,
  );
}
export function usePet() {
  const shared = useQuests(),
    { world, update } = useWorld(),
    { demo, state } = shared,
    data = state?.gamification;
  const pet = demo
    ? {
        name: world.profile.petName,
        feeds: world.pet.feeds,
        last_fed: world.pet.lastFed ? Date.parse(world.pet.lastFed) : null,
        next_feed_at: world.pet.lastFed
          ? Date.parse(world.pet.lastFed) + 14400000
          : null,
        wearing: world.pet.wearing || null,
        version: 0,
      }
    : data?.pet || {
        name: "โมจิ",
        feeds: 0,
        last_fed: null,
        next_feed_at: null,
        wearing: null,
        version: 0,
      };
  const items = demo
    ? [
        { id: "mint-hat", title: "หมวกใบโปรด", cost: 50 },
        { id: "rose-rug", title: "พรมสีชมพู", cost: 70 },
      ].map((i) => ({
        ...i,
        active: true,
        owned: world.pet.inventory.includes(i.id),
      }))
    : data?.items || [];
  const achievements = demo
    ? [
        {
          id: "first-quest",
          title: "ก้าวแรกของเรา",
          detail: "ทำภารกิจแรกสำเร็จ",
          progress: world.completions.length,
          target: 1,
        },
        {
          id: "team-ten",
          title: "ทีมเดียวกันเสมอ",
          detail: "ทำภารกิจสำเร็จ 10 ครั้ง",
          progress: world.completions.length,
          target: 10,
        },
        {
          id: "pet-favorite",
          title: "คนโปรดของโมจิ",
          detail: "ให้อาหารแมว 3 ครั้ง",
          progress: world.pet.feeds,
          target: 3,
        },
      ].map((a) => ({ ...a, unlocked_at: a.progress >= a.target ? 0 : null }))
    : data?.achievements || [];
  async function action(operation: "feed" | "purchase", itemId?: string) {
    if (!state || !shared.ready) return false;
    const storageKey = key(
      state.couple.id,
      operation === "feed" ? "feed" : "purchase:" + itemId,
    );
    try {
      const request_id =
        pendingStorage.getItem(storageKey) || crypto.randomUUID();
      pendingStorage.setItem(storageKey, request_id);
      window.dispatchEvent(new Event("olw-pet-pending"));
      const clear = () => {
        pendingStorage.removeItem(storageKey);
        window.dispatchEvent(new Event("olw-pet-pending"));
      };
      const ok = await shared.mutate(
        operation,
        operation === "feed" ? { request_id } : { item_id: itemId, request_id },
        operation === "feed" ? "ให้อาหารแล้ว ขอบคุณนะ ♡" : "ซื้อของให้แมวแล้ว",
        "pet",
        (status) => {
          if ([400, 403, 404, 409].includes(status)) clear();
        },
      );
      if (ok) clear();
      return ok;
    } catch {
      toast.error(
        "เก็บรหัสรายการไม่ได้ กรุณาเปิดสิทธิ์พื้นที่จัดเก็บแล้วลองใหม่",
      );
      return false;
    }
  }
  return {
    ...shared,
    ready: shared.ready && (demo || !!data),
    pet,
    items,
    achievements,
    serverNow: data?.server_now ?? null,
    feed: () =>
      demo
        ? update((s) => {
            if (
              s.pet.lastFed &&
              Date.now() - Date.parse(s.pet.lastFed) < 14400000
            )
              throw Error(
                "โมจิยังอิ่มอยู่ กลับมาอีกครั้งหลังให้อาหารครบ 4 ชั่วโมง",
              );
            return {
              ...s,
              pet: {
                ...s.pet,
                lastFed: new Date().toISOString(),
                feeds: s.pet.feeds + 1,
              },
            };
          }, `${pet.name}อิ่มท้องแล้ว ขอบคุณนะ ♡`)
        : action("feed"),
    purchase: (itemId: string) =>
      demo
        ? update((s) => {
            if (s.pet.inventory.includes(itemId)) return s;
            const item = items.find((i) => i.id === itemId);
            if (!item) throw Error("ไม่พบไอเทม");
            return {
              ...spend(
                s,
                item.cost,
                `ซื้อ ${item.title}`,
                new Date().toISOString(),
                crypto.randomUUID(),
              ),
              pet: {
                ...s.pet,
                inventory: [...s.pet.inventory, itemId],
                wearing: itemId,
              },
            };
          }, "ซื้อของให้โมจิแล้ว")
        : action("purchase", itemId),
    equip: (itemId: string | null) =>
      demo
        ? update(
            (s) => ({ ...s, pet: { ...s.pet, wearing: itemId || "" } }),
            "เปลี่ยนของแต่งให้โมจิแล้ว",
          )
        : shared.mutate(
            "equip",
            { item_id: itemId, version: pet.version },
            "เปลี่ยนของแต่งแล้ว",
            "pet",
          ),
    rename: (name: string, version: number) =>
      demo
        ? update(
            (s) => ({ ...s, profile: { ...s.profile, petName: name } }),
            "เปลี่ยนชื่อแมวแล้ว",
          )
        : shared.mutate(
            "rename",
            { name, version },
            "เปลี่ยนชื่อแมวแล้ว",
            "pet",
          ),
  };
}
