"use client";
import { useEffect } from "react";
import { reportClientError } from "@/lib/error-reporting";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  useEffect(() => {
    reportClientError("render");
  }, []);
  return (
    <section className="panel" role="alert">
      <h1>เปิดหน้านี้ไม่สำเร็จ</h1>
      <p className="muted space-bottom">
        กรุณาลองใหม่ ข้อมูลที่ยังไม่ได้บันทึกอาจต้องกรอกอีกครั้ง
      </p>
      <Button onClick={reset}>ลองใหม่</Button>
    </section>
  );
}
