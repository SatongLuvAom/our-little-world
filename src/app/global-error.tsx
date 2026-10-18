"use client";
import { useEffect } from "react";
import { reportClientError } from "@/lib/error-reporting";
export default function GlobalError({ reset }: { reset: () => void }) {
  useEffect(() => {
    reportClientError("render");
  }, []);
  return (
    <html lang="th">
      <body>
        <main role="alert">
          <h1>เปิดแอปไม่สำเร็จ</h1>
          <p>กรุณาลองใหม่เมื่อเชื่อมต่ออินเทอร์เน็ต</p>
          <button onClick={reset}>ลองใหม่</button>
        </main>
      </body>
    </html>
  );
}
