// Pending receipts survive an app restart; they are retried only by the user, never in the background.
export const pendingStorage = {
  getItem(key: string) {
    const saved = localStorage.getItem(key);
    if (saved !== null) return saved;
    const legacy = sessionStorage.getItem(key);
    if (legacy !== null) {
      localStorage.setItem(key, legacy);
      sessionStorage.removeItem(key);
    }
    return legacy;
  },
  setItem(key: string, value: string) {
    localStorage.setItem(key, value);
    sessionStorage.removeItem(key);
  },
  removeItem(key: string) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

export function subscribeConnection(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}
export const isOnline = () => navigator.onLine;
export const serverOnline = () => true;

let operations = 0;
let updating = false;
export const isAppBusy = () => operations > 0 || updating;
export function subscribeBusy(listener: () => void) {
  window.addEventListener("olw-operation", listener);
  return () => window.removeEventListener("olw-operation", listener);
}
export function beginOnlineOperation() {
  if (!navigator.onLine) throw Error("ออฟไลน์อยู่ กรุณาเชื่อมต่อก่อนบันทึก");
  if (updating) throw Error("กำลังอัปเดตแอป กรุณารอสักครู่");
  operations++;
  window.dispatchEvent(new Event("olw-operation"));
  return () => {
    operations--;
    window.dispatchEvent(new Event("olw-operation"));
  };
}
export function beginAppUpdate() {
  if (isAppBusy() || !navigator.onLine) return false;
  updating = true;
  window.dispatchEvent(new Event("olw-operation"));
  return true;
}
export function cancelAppUpdate() {
  updating = false;
  window.dispatchEvent(new Event("olw-operation"));
}
