"use client";
import {
  pendingStorage,
  beginOnlineOperation,
  isOnline,
  serverOnline,
  subscribeConnection,
} from "@/lib/client-safety";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { usePathname } from "next/navigation";
import { savingsHistorySchema } from "./planning-schema";
import {
  balance,
  complete,
  isDone,
  redeem,
  rewards,
  type Quest,
} from "./model";
import {
  heartHistorySchema,
  questStateSchema,
  type QuestState,
  type SaveQuest,
} from "./quest-schema";
import { isSharedPath, today } from "./utils";
import { useWorld } from "./world-store";

type Status = "loading" | "demo" | "paired" | "unpaired" | "error";
type Store = {
  state: QuestState | null;
  status: Status;
  error: string;
  pending: boolean;
  online: boolean;
  refresh: (force?: boolean) => Promise<void>;
  mutate: (
    operation: string,
    body: unknown,
    message: string,
    family?: "quests" | "planning" | "journal" | "pet",
    onRejected?: (status: number) => void,
  ) => Promise<boolean>;
  loadMore: (family?: "quests" | "planning") => Promise<void>;
};
const QuestContext = createContext<Store | null>(null);
const pendingRewardKey = (couple: string, reward: string) =>
  `olw:pending-reward:${couple}:${reward}`;
function subscribePendingReward(listener: () => void) {
  window.addEventListener("olw-reward-pending", listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("olw-reward-pending", listener);
    window.removeEventListener("storage", listener);
  };
}
export function usePendingReward(reward: string) {
  const store = useContext(QuestContext);
  const couple = store?.state?.couple.id;
  return useSyncExternalStore(
    subscribePendingReward,
    () => {
      try {
        return couple
          ? pendingStorage.getItem(pendingRewardKey(couple, reward))
          : null;
      } catch {
        return null;
      }
    },
    () => null,
  );
}
export function QuestProvider({ children }: { children: ReactNode }) {
  const online = useSyncExternalStore(
    subscribeConnection,
    isOnline,
    serverOnline,
  );
  const pathname = usePathname();
  const includePlanning = isSharedPath(pathname);
  const [state, setState] = useState<QuestState | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const version = useRef(0),
    mounted = useRef(false),
    authenticated = useRef(false),
    fetching = useRef(false),
    mutating = useRef(false);
  const refresh = useCallback(
    async (force = false) => {
      if (fetching.current && !force) return;
      const current = ++version.current;
      fetching.current = true;
      try {
        if (!navigator.onLine)
          throw Error(
            "ออฟไลน์ · ข้อมูลที่โหลดไว้เป็นข้อมูลเดิม เชื่อมต่อเพื่อยืนยันยอดล่าสุดก่อนบันทึก",
          );
        const response = await fetch(
          "/api/quests/state" +
            (includePlanning ? "?planning=1&journal=1&pet=1" : ""),
          {
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
          },
        );
        if (!mounted.current || current !== version.current) return;
        if (response.status === 401) {
          setState(null);
          setStatus(authenticated.current ? "error" : "demo");
          setError(
            authenticated.current
              ? "เซสชันสิ้นสุดแล้ว กรุณาเข้าสู่ระบบอีกครั้ง"
              : "",
          );
          return;
        }
        authenticated.current = true;
        if (response.status === 403) {
          setState(null);
          setStatus("unpaired");
          setError("");
          return;
        }
        if (!response.ok)
          throw Error("โหลดข้อมูลร่วมกันไม่สำเร็จ กรุณาลองใหม่");
        const next = questStateSchema.parse(await response.json());
        if (!mounted.current || current !== version.current) return;
        setState((previous) => {
          if (previous?.couple.id !== next.couple.id) return next;
          if (
            previous.planning &&
            next.planning &&
            previous.planning.history.entries.length > 30
          ) {
            const ids = new Set(next.planning.history.entries.map((e) => e.id));
            const entries = [
              ...next.planning.history.entries,
              ...previous.planning.history.entries.filter(
                (e) => !ids.has(e.id),
              ),
            ];
            const reversed = new Set(
              entries
                .filter((e) => e.kind === "reversal")
                .map((e) => e.reverses_id),
            );
            next.planning.history = {
              entries: entries.map((e) =>
                reversed.has(e.id) ? { ...e, reversed: true } : e,
              ),
              nextCursor: previous.planning.history.nextCursor,
            };
          }
          if (previous.history.entries.length <= 30) return next;
          const entries = [
            ...new Map(
              [...next.history.entries, ...previous.history.entries].map(
                (e) => [e.id, e],
              ),
            ).values(),
          ];
          return {
            ...next,
            history: { entries, nextCursor: previous.history.nextCursor },
          };
        });
        setStatus("paired");
        setError("");
      } catch (cause) {
        if (!mounted.current || current !== version.current) return;
        setStatus("error");
        setError(
          cause instanceof Error
            ? cause.message
            : "เชื่อมต่อไม่ได้ กรุณาลองใหม่",
        );
      } finally {
        if (current === version.current) fetching.current = false;
      }
    },
    [includePlanning],
  );
  useEffect(() => {
    mounted.current = true;
    const startup = setTimeout(() => void refresh(), 0);
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(visible, 30000);
    window.addEventListener("focus", visible);
    window.addEventListener("online", visible);
    window.addEventListener("offline", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      mounted.current = false;
      fetching.current = false;
      clearTimeout(startup);
      clearInterval(timer);
      window.removeEventListener("focus", visible);
      window.removeEventListener("online", visible);
      window.removeEventListener("offline", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  async function mutate(
    operation: string,
    body: unknown,
    message: string,
    family: "quests" | "planning" | "journal" | "pet" = "quests",
    onRejected?: (status: number) => void,
  ) {
    if (status !== "paired" || mutating.current || !navigator.onLine)
      return false;
    mutating.current = true;
    setPending(true);
    let finish: (() => void) | undefined;
    try {
      finish = beginOnlineOperation();
      const response = await fetch("/api/" + family + "/" + operation, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (response.status === 401) {
        ++version.current;
        fetching.current = false;
        setState(null);
        setStatus("error");
        setError("เซสชันสิ้นสุดแล้ว กรุณาเข้าสู่ระบบอีกครั้ง");
      }
      if (!response.ok) {
        onRejected?.(response.status);
        if (response.status === 409) await refresh(true);
        throw Error(result.error || "บันทึกไม่สำเร็จ");
      }
      toast.success(
        result.applied === false
          ? family === "journal" || family === "pet"
            ? "รายการนี้บันทึกแล้ว"
            : family === "planning"
              ? "รายการนี้บันทึกแล้ว ไม่บันทึกยอดซ้ำ"
              : "รายการนี้บันทึกแล้ว ไม่เพิ่มหรือหักหัวใจซ้ำ"
          : message,
      );
      await refresh(true);
      return true;
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "เชื่อมต่อไม่ได้ กรุณาลองใหม่ด้วยรายการเดิม",
      );
      return false;
    } finally {
      finish?.();
      mutating.current = false;
      setPending(false);
    }
  }
  async function loadMore(family: "quests" | "planning" = "quests") {
    const cursor =
      family === "planning"
        ? state?.planning?.history.nextCursor
        : state?.history.nextCursor;
    if (!cursor || !state || mutating.current || !navigator.onLine) return;
    mutating.current = true;
    setPending(true);
    const couple = state.couple.id;
    try {
      const response = await fetch(
        "/api/" + family + "/history?before=" + cursor,
        { cache: "no-store", signal: AbortSignal.timeout(15000) },
      );
      if (!response.ok) throw Error("โหลดประวัติเพิ่มไม่สำเร็จ");
      const raw = await response.json();
      if (family === "planning") {
        const history = savingsHistorySchema.parse(raw);
        setState((previous) => {
          if (previous?.couple.id !== couple || !previous.planning)
            return previous;
          const ids = new Set(
            previous.planning.history.entries.map((e) => e.id),
          );
          return {
            ...previous,
            planning: {
              ...previous.planning,
              history: {
                entries: [
                  ...previous.planning.history.entries,
                  ...history.entries.filter((e) => !ids.has(e.id)),
                ],
                nextCursor: history.nextCursor,
              },
            },
          };
        });
        return;
      }
      const history = heartHistorySchema.parse(raw);
      setState((previous) =>
        previous?.couple.id !== couple
          ? previous
          : {
              ...previous,
              history: {
                entries: [
                  ...new Map(
                    [...previous.history.entries, ...history.entries].map(
                      (e) => [e.id, e],
                    ),
                  ).values(),
                ],
                nextCursor: history.nextCursor,
              },
            },
      );
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "โหลดประวัติไม่สำเร็จ",
      );
    } finally {
      mutating.current = false;
      setPending(false);
    }
  }
  return (
    <QuestContext.Provider
      value={{
        state,
        status,
        error,
        pending,
        online,
        refresh,
        mutate,
        loadMore,
      }}
    >
      {children}
    </QuestContext.Provider>
  );
}
export function useQuests() {
  const store = useContext(QuestContext);
  if (!store) throw Error("QuestProvider is missing");
  const { world, update } = useWorld();
  const { state, status, mutate } = store;
  const demo = status === "demo",
    ready = demo || (status === "paired" && store.online);
  const members = state?.couple.members || [];
  const quests: Quest[] = demo
    ? world.quests
    : (state?.quests || []).map((q) => ({
        ...q,
        owner:
          q.assignee_id === null
            ? "ด้วยกัน"
            : q.assignee_id === members[0]?.id
              ? "เรา"
              : "เธอ",
      }));
  const profile = demo
    ? world.profile
    : {
        ...world.profile,
        name1: members[0]?.name || "เรา",
        name2: members[1]?.name || "รออีกคน",
        since: state?.couple.anniversary || today(),
      };
  const wallet = demo ? balance(world) : state?.balance || 0;
  return {
    ...store,
    demo,
    ready,
    quests,
    profile,
    wallet,
    catalog: demo ? rewards : state?.rewards || [],
    completionCount: demo
      ? world.completions.length
      : state?.completionCount || 0,
    todayCompletionCount: demo
      ? world.completions.filter((c) =>
          new Date(Date.parse(c.at) + 7 * 3600000)
            .toISOString()
            .startsWith(today()),
        ).length
      : state?.todayCompletionCount || 0,
    day: demo ? today() : state?.day || today(),
    entries: demo
      ? world.hearts.map((h) => ({
          id: h.id,
          title: h.reason,
          amount: h.amount,
          created_at: Date.parse(h.at),
          kind: h.amount > 0 ? "completion" : "redemption",
          category: h.reason.startsWith("ซื้อ ") ? "pet" : "reward",
        }))
      : state?.history.entries || [],
    redemptions: demo
      ? world.redemptions
      : (state?.history.entries || [])
          .filter((e) => e.kind === "redemption" && e.category !== "pet")
          .map((e) => ({
            id: e.id,
            title: e.title,
            cost: -e.amount,
            at: new Date(e.created_at).toISOString(),
          })),
    isDone: (q: Quest) =>
      demo
        ? isDone(world, q, today())
        : !!state?.quests.find((item) => item.id === q.id)?.done,
    canComplete: (q: Quest) =>
      ready &&
      !store.pending &&
      (demo ||
        (q.due <= state!.day &&
          (!state!.quests.find((item) => item.id === q.id)?.assignee_id ||
            state!.quests.find((item) => item.id === q.id)?.assignee_id ===
              state!.actor_id))),
    save: (q: Quest, version: number) =>
      demo
        ? update(
            (s) => ({
              ...s,
              quests: version
                ? s.quests.map((item) => (item.id === q.id ? q : item))
                : [q, ...s.quests],
            }),
            "บันทึกภารกิจแล้ว",
          )
        : mutate(
            "save",
            {
              id: q.id,
              title: q.title,
              assignee_id:
                q.owner === "ด้วยกัน"
                  ? null
                  : members[q.owner === "เรา" ? 0 : 1]?.id,
              due: q.due,
              repeat: q.repeat,
              hearts: q.hearts,
              version,
            } satisfies SaveQuest,
            "บันทึกภารกิจแล้ว",
          ),
    remove: (id: string) =>
      demo
        ? update(
            (s) => ({ ...s, quests: s.quests.filter((q) => q.id !== id) }),
            "ลบภารกิจแล้ว ประวัติหัวใจยังอยู่",
          )
        : mutate("delete", { id }, "ลบภารกิจแล้ว ประวัติหัวใจยังอยู่"),
    complete: (q: Quest) =>
      demo
        ? update(
            (s) =>
              complete(
                s,
                q.id,
                today(),
                new Date().toISOString(),
                crypto.randomUUID(),
              ),
            `สำเร็จแล้ว! +${q.hearts} หัวใจ`,
          )
        : mutate(
            "complete",
            { id: q.id, request_id: crypto.randomUUID() },
            "ทำภารกิจสำเร็จแล้ว",
          ),
    redeem: async (rewardId: string, requestId: string) => {
      if (demo)
        return update(
          (s) => redeem(s, rewardId, new Date().toISOString(), requestId),
          "แลกรางวัลแล้ว",
        );
      if (!state || !ready) return false;
      // Persist uncertain requests across dialog closes/reloads. Never mint a new spend ID on a timeout.
      const key = pendingRewardKey(state.couple.id, rewardId);
      try {
        const id = pendingStorage.getItem(key) || requestId;
        pendingStorage.setItem(key, id);
        window.dispatchEvent(new Event("olw-reward-pending"));
        const ok = await mutate(
          "redeem",
          { reward_id: rewardId, request_id: id },
          "แลกรางวัลแล้ว",
        );
        if (ok) {
          pendingStorage.removeItem(key);
          window.dispatchEvent(new Event("olw-reward-pending"));
        }
        return ok;
      } catch {
        toast.error(
          "เก็บรหัสรายการแลกไม่ได้ กรุณาเปิดสิทธิ์พื้นที่จัดเก็บแล้วลองใหม่",
        );
        return false;
      }
    },
  };
}
