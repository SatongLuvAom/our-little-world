"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useQuests } from "@/lib/quest-store";
import { beginOnlineOperation } from "@/lib/client-safety";
import { Button } from "./ui/button";
import { PwaContext } from "./pwa";
type Device = {
  id: string;
  endpoint_hash: string;
  device: string;
  created_at: number;
  quests: number;
  dates: number;
  letters: number;
  last_sent_at: number | null;
  last_status: number | null;
};
type State = {
  configured: boolean;
  publicKey: string | null;
  devices: Device[];
};
type Choices = { quests: boolean; dates: boolean; letters: boolean };
async function api(
  operation: string,
  body?: unknown,
): Promise<State & { state?: string }> {
  const response = await fetch("/api/push/" + operation, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "ดำเนินการแจ้งเตือนไม่สำเร็จ");
  return data;
}
async function capable(registration: ServiceWorkerRegistration) {
  return new Promise<boolean>((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve(false);
    }, 2000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(event.data?.push === true);
    };
    registration.active?.postMessage({ type: "PUSH_CAPABLE" }, [channel.port2]);
  });
}
const publicBytes = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
async function endpointHash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function PushTools() {
  const pwaReady = useContext(PwaContext)?.ready;
  const [reload, setReload] = useState(0);
  const { demo, ready, state } = useQuests(),
    actor = state?.actor_id,
    couple = state?.couple.id;
  const [data, setData] = useState<State | null>(null),
    [device, setDevice] = useState<Device | null>(null);
  const [choices, setChoices] = useState<Choices>({
    quests: true,
    dates: true,
    letters: true,
  });
  const [supported, setSupported] = useState(false),
    [workerReady, setWorkerReady] = useState(false),
    [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const working = useRef(false),
    registration = useRef<ServiceWorkerRegistration | null>(null);
  useEffect(() => {
    if (
      !actor ||
      !couple ||
      !ready ||
      !pwaReady ||
      !("serviceWorker" in navigator)
    )
      return;
    let disposed = false;
    const support = "PushManager" in window && "Notification" in window;
    void (async () => {
      try {
        const next = await api("state");
        if (disposed) return;
        setSupported(support);
        setData(next);
        if (!support) return;
        // Do not wait forever on an old/unavailable service worker; the PWA update UI remains usable.
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg?.active) {
          setError("รอเตรียมหน้าแอป แล้วโหลดหน้าใหม่เพื่อเปิดแจ้งเตือน");
          return;
        }
        registration.current = reg;
        const isCapable = await capable(reg);
        if (disposed) return;
        setWorkerReady(isCapable);
        if (!isCapable)
          setError("อัปเดตแอปเป็นเวอร์ชันล่าสุดก่อนเปิดแจ้งเตือน");
        const sub = await reg.pushManager.getSubscription();
        const hash = sub ? await endpointHash(sub.endpoint) : "";
        if (disposed) return;
        const current =
          next.devices.find((d) => d.endpoint_hash === hash) || null;
        setDevice(current);
        if (current)
          setChoices({
            quests: !!current.quests,
            dates: !!current.dates,
            letters: !!current.letters,
          });
      } catch (cause) {
        if (!disposed)
          setError(
            cause instanceof Error
              ? cause.message
              : "โหลดการแจ้งเตือนไม่สำเร็จ",
          );
      }
    })();
    return () => {
      disposed = true;
    };
  }, [actor, couple, ready, pwaReady, reload]);
  async function run(action: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    let finish: (() => void) | undefined;
    try {
      finish = beginOnlineOperation();
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      finish?.();
      working.current = false;
      setBusy(false);
    }
  }
  async function refreshDevice(sub: PushSubscription | null) {
    const next = await api("state"),
      hash = sub ? await endpointHash(sub.endpoint) : "";
    setData(next);
    setDevice(next.devices.find((d) => d.endpoint_hash === hash) || null);
  }
  if (demo || !actor) return null;
  return (
    <section className="panel pwa-tools" aria-label="แจ้งเตือนบนเครื่องนี้">
      <h2>
        เตือนเรื่องเล็ก ๆ ของเรา <Bell size={19} />
      </h2>
      <p className="muted">
        แต่ละคนเปิดแยกบนเครื่องของตัวเอง · สูงสุด 3 เครื่องต่อคน
        ข้อความแจ้งเตือนไม่แสดงชื่อเรื่องหรือเนื้อหาส่วนตัว
      </p>
      <p className="muted text-sm">
        iPhone ต้องเปิดจากไอคอนบนหน้าจอโฮม (iOS 16.4 ขึ้นไป) · Android ใช้
        Chrome ที่รองรับการแจ้งเตือน
      </p>
      <div className="push-choices">
        {(
          [
            ["quests", "ภารกิจที่ยังไม่เสร็จ · 09:00 น."],
            ["dates", "นัดหมาย · ภายใน 30 นาทีก่อนถึงเวลา"],
            ["letters", "จดหมายจากอีกคน · หลังเปิดอ่านได้"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={choices[key]}
              disabled={busy || !ready}
              onChange={(event) =>
                setChoices({ ...choices, [key]: event.target.checked })
              }
            />
            {label}
          </label>
        ))}
      </div>
      <p className="muted text-sm">
        ใช้เวลาไทย ตรวจเตือนทุก 15 นาที
        การถึงเครื่องขึ้นกับอินเทอร์เน็ตและการตั้งค่าของโทรศัพท์
        ออกจากระบบแล้วจะหยุดส่งให้เครื่องที่ผูกกับเซสชันนั้น
      </p>
      {data && !data.configured && (
        <p role="status">ระบบแจ้งเตือนยังไม่พร้อม กรุณาลองใหม่ภายหลัง</p>
      )}
      {data && !supported && (
        <p role="status">
          เครื่องนี้ยังใช้ Push ไม่ได้ บน iPhone
          ให้ติดตั้งและเปิดแอปจากหน้าจอโฮมก่อน
        </p>
      )}
      <div className="pwa-actions">
        <Button
          variant="secondary"
          disabled={
            !ready || busy || !supported || !workerReady || !data?.publicKey
          }
          onClick={() =>
            void run(async () => {
              // Permission must be requested directly inside the user's click, before any network await (iOS).
              const permission = await Notification.requestPermission();
              if (permission !== "granted")
                throw Error(
                  "ยังไม่ได้รับอนุญาต กรุณาเปิดการแจ้งเตือนในการตั้งค่าเว็บไซต์หรือโทรศัพท์ แล้วลองใหม่",
                );
              const reg = registration.current!;
              let sub = await reg.pushManager.getSubscription();
              if (sub && !device) {
                if (!(await sub.unsubscribe()))
                  throw Error(
                    "ล้างรหัสรับแจ้งเตือนเดิมไม่ได้ กรุณาตรวจการตั้งค่าเว็บไซต์ก่อนลองใหม่",
                  );
                sub = null;
              }
              if (!sub)
                sub = await reg.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: publicBytes(data!.publicKey!),
                });
              const ua = navigator.userAgent;
              await api("subscribe", {
                subscription: sub.toJSON(),
                device: /iPhone|iPad|iPod/.test(ua)
                  ? "iPhone / iPad"
                  : /Android/.test(ua)
                    ? "Android"
                    : "Browser",
                ...choices,
              });
              await refreshDevice(sub);
              setMessage("เปิดการแจ้งเตือนเครื่องนี้แล้ว");
            })
          }
        >
          <Bell size={16} />
          {device ? "บันทึกการแจ้งเตือน" : "เปิดแจ้งเตือนเครื่องนี้"}
        </Button>
        {device && (
          <>
            <Button
              variant="ghost"
              disabled={!ready || busy}
              onClick={() =>
                void run(async () => {
                  const result = await api("test", {
                    id: device.id,
                    request_id: crypto.randomUUID(),
                  });
                  await refreshDevice(
                    await registration.current!.pushManager.getSubscription(),
                  );
                  if (result.state !== "sent")
                    throw Error(
                      result.state === "uncertain" || result.state === "sending"
                        ? "ยังยืนยันการส่งไม่ได้ กรุณาตรวจเครื่องก่อนลองใหม่"
                        : "ส่งทดสอบไม่สำเร็จ กรุณาเปิดแจ้งเตือนใหม่หรือลองอีกครั้งภายหลัง",
                    );
                  setMessage(
                    "บริการ Push รับข้อความทดสอบแล้ว ตรวจการแจ้งเตือนบนเครื่องของคุณ",
                  );
                })
              }
            >
              ทดสอบแจ้งเตือน
            </Button>
            <Button
              variant="ghost"
              disabled={!ready || busy}
              onClick={() =>
                void run(async () => {
                  await api("unsubscribe", { id: device.id });
                  setDevice(null);
                  const sub =
                    await registration.current!.pushManager.getSubscription();
                  if (sub && !(await sub.unsubscribe()))
                    throw Error(
                      "server หยุดส่งแล้ว แต่เครื่องยังลบรหัสรับแจ้งเตือนไม่สำเร็จ กรุณาตรวจการตั้งค่าเว็บไซต์",
                    );
                  await refreshDevice(null);
                  setMessage("ปิดการแจ้งเตือนเครื่องนี้แล้ว");
                })
              }
            >
              <BellOff size={16} />
              ปิดแจ้งเตือนเครื่องนี้
            </Button>
          </>
        )}
      </div>
      {device && (
        <p className="muted text-sm">
          เปิดอยู่ {data?.devices.length || 0} เครื่องของคุณ
          {device.last_sent_at
            ? " · บริการรับข้อความล่าสุด " +
              new Date(device.last_sent_at).toLocaleString("th-TH", {
                timeZone: "Asia/Bangkok",
              })
            : ""}
        </p>
      )}
      {data?.devices
        .filter((other) => other.id !== device?.id)
        .map((other, index) => (
          <div className="account-note" key={other.id}>
            <p>
              {other.device} · เพิ่มเมื่อ{" "}
              {new Date(other.created_at).toLocaleDateString("th-TH")}
              <br />
              คุณหยุดส่งให้เครื่องเก่าหรือเครื่องที่ไม่ได้ใช้แล้วได้
            </p>
            <Button
              size="sm"
              variant="ghost"
              disabled={!ready || busy}
              aria-label={`ปิดอุปกรณ์อื่น ${index + 1}`}
              onClick={() =>
                void run(async () => {
                  await api("unsubscribe", { id: other.id });
                  await refreshDevice(
                    (await registration.current?.pushManager.getSubscription()) ||
                      null,
                  );
                  setMessage("หยุดส่งให้เครื่องที่เลือกแล้ว");
                })
              }
            >
              หยุดส่ง
            </Button>
          </div>
        ))}
      {(error || (data && !data.configured)) && (
        <Button
          variant="ghost"
          disabled={!ready || busy}
          onClick={() => {
            setError("");
            setReload((value) => value + 1);
          }}
        >
          โหลดการแจ้งเตือนล่าสุด
        </Button>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </section>
  );
}
