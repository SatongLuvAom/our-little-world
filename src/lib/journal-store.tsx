"use client";
import { useQuests } from "./quest-store";
import { useWorld } from "./world-store";
import { today } from "./utils";
export function useJournal() {
  const shared = useQuests(),
    { world } = useWorld(),
    { state, demo } = shared;
  const data = state?.journal;
  const name = (id: string) =>
    state?.couple.members.find((m) => m.id === id)?.name || "คนของเรา";
  return {
    ...shared,
    ready: shared.ready && (demo || !!data),
    day: data?.day || today(),
    memories: demo
      ? world.memories.map((m) => ({ ...m, author_id: "", canDelete: true }))
      : (data?.memories || []).map((m) => ({
          ...m,
          canDelete: m.author_id === state?.actor_id,
        })),
    letters: demo
      ? world.letters.map((l) => ({
          ...l,
          authorName:
            l.author === "เรา" ? world.profile.name1 : world.profile.name2,
          locked: l.openOn > today(),
          canDelete: true,
        }))
      : (data?.letters || []).map((l) => ({
          ...l,
          authorName: name(l.author_id),
          canDelete: l.author_id === state?.actor_id,
        })),
    moods: demo
      ? world.moods.map((m) => ({
          ...m,
          user_id: m.person,
          name: m.person === "เรา" ? world.profile.name1 : world.profile.name2,
          version: 1,
        }))
      : (data?.moods || []).map((m) => ({
          ...m,
          id: m.user_id + ":" + m.day,
          name: name(m.user_id),
        })),
    save: (body: unknown) =>
      shared.mutate("save", body, "บันทึกแล้ว", "journal"),
    remove: (kind: "memory" | "letter", id: string) =>
      shared.mutate("delete", { kind, id }, "ลบรายการแล้ว", "journal"),
  };
}
