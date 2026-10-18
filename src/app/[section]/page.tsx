import { notFound } from "next/navigation";
import { Suspense } from "react";
import { QuestsPage } from "@/components/quests";
import { SavingsPage } from "@/components/savings";
import { ExplorePage } from "@/components/explore";
import { UsPage } from "@/components/us";
const sections = ["quests", "savings", "explore", "us"];
export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  return {
    title: (
      {
        quests: "ภารกิจ",
        savings: "เงินออม",
        explore: "ออกสำรวจ",
        us: "เราสองคน",
      } as Record<string, string>
    )[section],
  };
}
export function generateStaticParams() {
  return sections.map((section) => ({ section }));
}
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.includes(section)) notFound();
  return {
    quests: (
      <Suspense
        fallback={<div className="skeleton" aria-label="กำลังเปิดภารกิจ" />}
      >
        <QuestsPage />
      </Suspense>
    ),
    savings: <SavingsPage />,
    explore: <ExplorePage />,
    us: <UsPage />,
  }[section];
}
