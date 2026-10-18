"use client";
import { usePathname } from "next/navigation";
export default function Loading() {
  const pathname = usePathname();
  const content = (
    <>
      <div className="skeleton" />
      <div className="skeleton" />
      <h1 aria-live="polite">กำลังเปิดหน้า…</h1>
    </>
  );
  if (/^\/(login|register|account|pairing)(\/|$)/.test(pathname))
    return (
      <main id="main" tabIndex={-1} className="loading-screen">
        {content}
      </main>
    );
  return <div className="loading-screen">{content}</div>;
}
