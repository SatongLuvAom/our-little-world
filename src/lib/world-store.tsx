"use client";
import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { seed, stateSchema, type World } from "./model";
import { today } from "./utils";
const KEY = "our-little-world:v1";
type Snapshot = { world: World; error: string | null } | null;
let snapshot: Snapshot = null;
let initialized = false;
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    snapshot = {
      world: raw ? stateSchema.parse(JSON.parse(raw)) : seed(today()),
      error: null,
    };
  } catch {
    snapshot = {
      world: seed(today()),
      error:
        "อ่านข้อมูลในเครื่องไม่สำเร็จ จึงแสดงข้อมูลตัวอย่างและหยุดการบันทึก กรุณาส่งออกข้อมูลเดิมหรือล้างข้อมูลที่หน้า Us",
    };
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!initialized) {
    initialized = true;
    load();
    window.addEventListener("storage", (e) => {
      if (e.key === KEY) {
        load();
        emit();
      }
    });
    emit();
  }
  return () => {
    listeners.delete(listener);
  };
}
const getSnapshot = () => snapshot;
const serverSnapshot = () => null;
type Context = {
  world: World;
  storageError: string | null;
  update: (change: (s: World) => World, message?: string) => boolean;
  reset: () => void;
  exportData: () => void;
};
const WorldContext = createContext<Context | null>(null);
export function WorldProvider({ children }: { children: ReactNode }) {
  const current = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  if (!current)
    return (
      <main id="main" className="loading-screen" tabIndex={-1}>
        <div className="skeleton" />
        <div className="skeleton" />
        <h1 aria-live="polite">กำลังเปิดโลกใบเล็กของเรา…</h1>
      </main>
    );
  function update(change: (s: World) => World, message?: string) {
    try {
      if (!snapshot || snapshot.error)
        throw new Error(snapshot?.error || "ข้อมูลยังไม่พร้อม");
      const next = stateSchema.parse(change(snapshot.world));
      localStorage.setItem(KEY, JSON.stringify(next));
      snapshot = { world: next, error: null };
      emit();
      if (message) toast.success(message);
      return true;
    } catch (error) {
      toast.error(
        error instanceof DOMException && error.name === "QuotaExceededError"
          ? "พื้นที่ในเครื่องเต็ม ลองส่งออกและนำรูปที่ไม่ต้องการออกก่อนบันทึกอีกครั้ง"
          : error instanceof Error && error.name !== "ZodError"
            ? error.message
            : "บันทึกไม่สำเร็จ ตรวจสอบข้อมูลหรือพื้นที่จัดเก็บในเครื่อง",
      );
      return false;
    }
  }
  function reset() {
    try {
      const fresh = seed(today());
      localStorage.setItem(KEY, JSON.stringify(fresh));
      snapshot = { world: fresh, error: null };
      emit();
      toast.success("เริ่มโลกตัวอย่างใหม่แล้ว");
    } catch {
      toast.error("เข้าถึงพื้นที่จัดเก็บไม่ได้ ตรวจสอบการตั้งค่า Browser");
    }
  }
  function exportData() {
    try {
      const raw = localStorage.getItem(KEY) || JSON.stringify(current?.world);
      const url = URL.createObjectURL(
        new Blob([raw], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `our-little-world-${today()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("ส่งออกไม่ได้ ตรวจสอบสิทธิ์เข้าถึงพื้นที่จัดเก็บของ Browser");
    }
  }
  return (
    <WorldContext.Provider
      value={{
        world: current.world,
        storageError: current.error,
        update,
        reset,
        exportData,
      }}
    >
      {children}
    </WorldContext.Provider>
  );
}
export function useWorld() {
  const value = useContext(WorldContext);
  if (!value) throw new Error("WorldProvider is missing");
  return value;
}
