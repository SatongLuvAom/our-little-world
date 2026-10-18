import { Suspense } from "react";
import { QuestsPage } from "@/components/quests";

export const metadata = { title: "ภารกิจ" };

export default function Page() {
  return (
    <>
      {/* Overlap the existing private, no-store read with hydration. */}
      <link
        rel="preload"
        as="fetch"
        href="/api/quests/state?planning=1&journal=1&pet=1"
        crossOrigin="anonymous"
      />
      <Suspense
        fallback={
          <div className="skeleton" role="status" aria-label="กำลังเปิดภารกิจ" />
        }
      >
        <QuestsPage />
      </Suspense>
    </>
  );
}
