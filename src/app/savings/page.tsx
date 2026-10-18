import { SavingsPage } from "@/components/savings";

export const metadata = { title: "เงินออม" };

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
      <SavingsPage />
    </>
  );
}
