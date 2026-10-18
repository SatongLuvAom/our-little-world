"use client";
import { useState } from "react";
import { useQuests } from "@/lib/quest-store";
import { Button } from "./ui/button";
import { SectionTitle } from "./shared";
export function DiagnosticTools() {
  const { demo, ready } = useQuests();
  const [result, setResult] = useState<{ count: number; id: string } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  if (demo || !ready) return null;
  return (
    <section className="panel">
      <SectionTitle
        title="การทำงานของแอป"
        detail="เก็บเฉพาะประเภทปัญหาและรหัสตรวจสอบ ไม่เก็บเนื้อหาส่วนตัว"
      />
      <Button
        variant="secondary"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError("");
          try {
            const response = await fetch("/api/diagnostics/state", {
              cache: "no-store",
              signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) throw Error("โหลดสถานะแอปไม่ได้ กรุณาลองใหม่");
            const body = await response.json();
            setResult({
              count: body.totalCount,
              id: body.events[0]?.last_id || "",
            });
          } catch {
            setError("โหลดสถานะแอปไม่ได้ กรุณาลองใหม่");
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "กำลังตรวจสอบ…" : "ดูสถานะแอป"}
      </Button>
      {result && (
        <div role="status" className="space-top text-sm">
          <p>
            {result.count
              ? `พบสัญญาณปัญหา ${result.count} ครั้งใน 7 วันที่ผ่านมา`
              : "ไม่พบสัญญาณปัญหาที่บันทึกไว้ใน 7 วันที่ผ่านมา"}
          </p>
          {result.id && (
            <p className="diagnostic-id">
              รหัสล่าสุดสำหรับแจ้งปัญหา: <code>{result.id}</code>
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </section>
  );
}
