"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Download, RefreshCw, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  beginAppUpdate,
  cancelAppUpdate,
  isAppBusy,
  isOnline,
  serverOnline,
  subscribeBusy,
  subscribeConnection,
} from "@/lib/client-safety";
import { Button } from "./ui/button";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
type Pwa = {
  install: () => Promise<void>;
  installed: boolean;
  ready: boolean;
  error: string;
  check: () => Promise<void>;
};
export const PwaContext = createContext<Pwa | null>(null);
export function PwaProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pushUrl, setPushUrl] = useState<string | null>(null);
  const online = useSyncExternalStore(
    subscribeConnection,
    isOnline,
    serverOnline,
  );
  const busy = useSyncExternalStore(subscribeBusy, isAppBusy, () => false);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    let disposed = false;
    let applying = false;
    let updateTimer: ReturnType<typeof setTimeout> | undefined;
    const display = window.matchMedia("(display-mode: standalone)");
    const standalone = () =>
      setInstalled(
        display.matches ||
          !!(navigator as Navigator & { standalone?: boolean }).standalone,
      );
    const prompt = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    const installedNow = () => {
      setInstalled(true);
      setInstall(null);
    };
    standalone();
    display.addEventListener("change", standalone);
    window.addEventListener("beforeinstallprompt", prompt);
    window.addEventListener("appinstalled", installedNow);
    // Development HTML must never be captured by a production service worker.
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    )
      return () => {
        display.removeEventListener("change", standalone);
        window.removeEventListener("beforeinstallprompt", prompt);
        window.removeEventListener("appinstalled", installedNow);
      };
    const controller = () => {
      if (applying) window.location.reload();
    };
    const message = (event: MessageEvent) => {
      if (
        event.data?.type === "PUSH_OPEN" &&
        ["/quests", "/explore/dates", "/explore/letters", "/us"].includes(
          event.data.url,
        )
      ) {
        if (isAppBusy() || document.querySelector('[role="dialog"], form'))
          setPushUrl(event.data.url);
        else router.push(event.data.url);
        return;
      }
      if (event.data?.type !== "UPDATE_BLOCKED") return;
      applying = false;
      clearTimeout(updateTimer);
      cancelAppUpdate();
      setError("ปิดแท็บหรือหน้าต่างอื่นของแอปนี้ก่อน แล้วกดอัปเดตอีกครั้ง");
    };
    const apply = () => {
      applying = true;
      updateTimer = setTimeout(() => {
        applying = false;
        cancelAppUpdate();
        setError("อัปเดตยังไม่สำเร็จ กรุณาเชื่อมต่อแล้วลองใหม่");
      }, 15000);
    };
    navigator.serviceWorker.addEventListener("controllerchange", controller);
    navigator.serviceWorker.addEventListener("message", message);
    window.addEventListener("olw-apply-update", apply);
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        if (disposed) return;
        setRegistration(reg);
        setWaiting(reg.waiting);
        const watch = () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => {
            if (disposed) return;
            if (worker.state === "installed") {
              if (navigator.serviceWorker.controller) setWaiting(reg.waiting);
            }
            if (worker.state === "redundant")
              setError(
                "เตรียมออฟไลน์ไม่สำเร็จ กรุณาตรวจเครือข่ายแล้วตรวจอัปเดตอีกครั้ง",
              );
          });
        };
        reg.addEventListener("updatefound", watch);
        watch();
        if (reg.active) setReady(true);
        void navigator.serviceWorker.ready.then(() => {
          if (!disposed) setReady(true);
        });
      })
      .catch(() => {
        if (!disposed)
          setError("เตรียมออฟไลน์ไม่สำเร็จ เบราว์เซอร์อาจปิดพื้นที่จัดเก็บ");
      });
    return () => {
      disposed = true;
      clearTimeout(updateTimer);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        controller,
      );
      navigator.serviceWorker.removeEventListener("message", message);
      window.removeEventListener("olw-apply-update", apply);
      display.removeEventListener("change", standalone);
      window.removeEventListener("beforeinstallprompt", prompt);
      window.removeEventListener("appinstalled", installedNow);
    };
  }, [router]);
  async function check() {
    if (!registration || !online) return;
    setError("");
    try {
      await registration.update();
      setWaiting(registration.waiting);
    } catch {
      setError("ตรวจอัปเดตไม่ได้ กรุณาลองอีกครั้งเมื่อเชื่อมต่อ");
    }
  }
  async function requestInstall() {
    const prompt = install;
    setInstall(null);
    if (!prompt) return;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      setError(
        "เปิดหน้าติดตั้งไม่ได้ กรุณาใช้เมนูเพิ่มลงในหน้าจอหลักของเบราว์เซอร์",
      );
    }
  }
  return (
    <PwaContext.Provider
      value={{ install: requestInstall, installed, ready, error, check }}
    >
      <div className="pwa-status" aria-live="polite">
        {pushUrl && (
          <div className="pwa-update">
            <span>มีการแจ้งเตือนรออยู่ บันทึกหรือปิดแบบฟอร์มก่อนเปิด</span>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                if (
                  isAppBusy() ||
                  document.querySelector('[role="dialog"], form')
                )
                  return;
                router.push(pushUrl);
                setPushUrl(null);
              }}
            >
              ดูการแจ้งเตือน
            </Button>
          </div>
        )}
        {!online && (
          <p role="status">
            <WifiOff size={17} /> ออฟไลน์ · อ่านข้อมูลที่โหลดไว้ในรอบนี้ได้
            แต่ยังบันทึกไม่ได้ เปิดแอปใหม่ต้องเชื่อมต่อเพื่อยืนยันบัญชี
          </p>
        )}
        {waiting && (
          <div className="pwa-update">
            <span>
              มีแอปเวอร์ชันใหม่ · อัปเดตจะโหลดหน้าใหม่
              กรุณาบันทึกหรือปิดแบบฟอร์มก่อน
            </span>
            <Button
              size="sm"
              disabled={busy || !online}
              onClick={() => {
                if (document.querySelector('[role="dialog"], form')) {
                  setError("บันทึกหรือปิดแบบฟอร์มก่อนอัปเดตแอป");
                  return;
                }
                if (!beginAppUpdate()) return;
                setError("");
                window.dispatchEvent(new Event("olw-apply-update"));
                waiting.postMessage({ type: "APPLY_UPDATE" });
              }}
            >
              <RefreshCw size={14} /> อัปเดตแอป
            </Button>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
      {children}
    </PwaContext.Provider>
  );
}

export function PwaTools() {
  const pwa = useContext(PwaContext);
  const [help, setHelp] = useState(false);
  if (!pwa) return null;
  return (
    <section className="panel pwa-tools" aria-label="ติดตั้งและออฟไลน์">
      <h2>พกโลกของเราไปด้วยกัน</h2>
      <p className="muted">
        {pwa.installed
          ? "เปิดเป็นแอปแล้ว"
          : "เพิ่มไอคอนบนหน้าจอหลัก iPhone / Android ได้ฟรี"}{" "}
        ·{" "}
        {pwa.ready
          ? "เตรียมหน้าแอปสำหรับออฟไลน์แล้ว"
          : "เชื่อมต่อเพื่อเตรียมหน้าแอปสำหรับออฟไลน์"}
      </p>
      <div className="pwa-actions">
        {!pwa.installed && (
          <Button
            variant="secondary"
            onClick={async () => {
              setHelp(true);
              await pwa.install();
            }}
          >
            <Download size={16} /> ติดตั้งแอป
          </Button>
        )}
        <Button variant="ghost" onClick={() => void pwa.check()}>
          ตรวจอัปเดตแอป
        </Button>
      </div>
      {help && (
        <div className="account-note">
          <p>
            iPhone: เปิดใน Safari → เมนูแชร์ → เพิ่มไปยังหน้าจอโฮม →
            เปิดเป็นเว็บแอป → เพิ่ม
            <br />
            Android: เปิดใน Chrome → เมนู ⋮ → ติดตั้งแอป / เพิ่มลงในหน้าจอหลัก
          </p>
        </div>
      )}
      <p className="muted text-sm">
        ออฟไลน์อ่านข้อมูลที่โหลดไว้ได้จนกว่าจะปิดหรือโหลดแอปใหม่
        รูปส่วนตัวและเนื้อหาจดหมายต้องเชื่อมต่อเสมอ
        เงินและหัวใจไม่มีการส่งรายการอัตโนมัติ
        เมื่อไม่ทราบผลให้กดตรวจสอบรายการเดิมหลังเชื่อมต่อ
      </p>
    </section>
  );
}
