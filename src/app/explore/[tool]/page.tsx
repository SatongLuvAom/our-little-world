import { notFound } from "next/navigation";
import { ExploreTool } from "@/components/explore";
const ids = [
  "dates",
  "wishlist",
  "calendar",
  "memories",
  "letters",
  "mood",
  "roulette",
  "pet",
];
export async function generateMetadata({
  params,
}: {
  params: Promise<{ tool: string }>;
}) {
  const { tool } = await params;
  return {
    title: (
      {
        dates: "นัดหมาย",
        wishlist: "ลิสต์ความฝัน",
        calendar: "ปฏิทิน",
        memories: "ความทรงจำ",
        letters: "จดหมาย",
        mood: "ความรู้สึกวันนี้",
        roulette: "วงล้อกิจกรรม",
        pet: "แมวของเรา",
      } as Record<string, string>
    )[tool],
  };
}
export function generateStaticParams() {
  return ids.map((tool) => ({ tool }));
}
export default async function Page({
  params,
}: {
  params: Promise<{ tool: string }>;
}) {
  const { tool } = await params;
  if (!ids.includes(tool)) notFound();
  return <ExploreTool tool={tool} />;
}
