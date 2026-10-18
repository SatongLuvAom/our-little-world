"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { reportClientError } from "@/lib/error-reporting";
export default function ErrorPage({ reset }: { reset: () => void }) {
  useEffect(() => {
    reportClientError("render");
  }, []);
  return (
    <main id="main" className="auth-layout">
      <section className="panel">
        <h1>โหลดบัญชีไม่สำเร็จ</h1>
        <p className="muted space-bottom">
          ตรวจ D1 binding, Migration และการเชื่อมต่อ แล้วลองใหม่
        </p>
        <Button onClick={reset}>ลองใหม่</Button>
        <Link href="/" className="text-link">
          กลับ Demo
        </Link>
      </section>
    </main>
  );
}
