"use client";
import Link from "next/link";
import {
  CalendarHeart,
  Telescope,
  MapPin,
  BookHeart,
  Mail,
  HeartPulse,
  Dices,
  Cat,
  ArrowUpRight,
  ArrowLeft,
} from "lucide-react";
import { PageHeading, MoodCheckin, SectionTitle, Empty } from "./shared";
import { DatesTool, WishlistTool, CalendarTool } from "./planning-tools";
import { MemoriesTool, LettersTool } from "./memory-tools";
import { RouletteTool, PetTool } from "./play-tools";
import { useJournal } from "@/lib/journal-store";
import { dateLabel } from "@/lib/utils";
import { QuestStatus } from "./quests";
export const tools = [
  {
    id: "dates",
    name: "Date Planner",
    title: "นัดของเราสองคน",
    detail: "ล็อกวันดี ๆ แล้วออกไปใช้เวลาด้วยกัน",
    icon: CalendarHeart,
    color: "pink",
  },
  {
    id: "wishlist",
    name: "Wishlist",
    title: "ลิสต์ความฝันของเรา",
    detail: "อยากกิน อยากไป อยากทำ จดไว้ด้วยกัน",
    icon: MapPin,
    color: "mint",
  },
  {
    id: "calendar",
    name: "Couple Calendar",
    title: "ปฏิทินของเรา",
    detail: "ไม่พลาดนัดสำคัญ และวันของเรา",
    icon: CalendarHeart,
    color: "apricot",
  },
  {
    id: "memories",
    name: "Memory Book",
    title: "สมุดความทรงจำ",
    detail: "เก็บภาพและเรื่องราวที่ทำให้ยิ้ม",
    icon: BookHeart,
    color: "lavender",
  },
  {
    id: "letters",
    name: "Love Letters",
    title: "จดหมายถึงเธอ",
    detail: "ฝากคำบอกรัก ไว้เปิดในวันพิเศษ",
    icon: Mail,
    color: "apricot",
  },
  {
    id: "mood",
    name: "Daily Check-in",
    title: "ฟังเสียงหัวใจ",
    detail: "แบ่งปันความรู้สึก ให้เราเข้าใจกัน",
    icon: HeartPulse,
    color: "pink",
  },
  {
    id: "roulette",
    name: "Love Roulette",
    title: "วงล้อของเรา",
    detail: "เลือกไม่ถูกใช่ไหม ให้หัวใจช่วยสุ่ม",
    icon: Dices,
    color: "lavender",
  },
  {
    id: "pet",
    name: "Virtual Pet",
    title: "เจ้าตัวเล็กของเรา",
    detail: "แวะมาให้อาหารและเล่นกับโมจิ",
    icon: Cat,
    color: "mint",
  },
];
export function ExplorePage() {
  return (
    <>
      <QuestStatus label="เครื่องมือวางแผน" />
      <PageHeading
        eyebrow="MAKE ROOM FOR LITTLE JOYS"
        title="ออกสำรวจโลกของเรา"
        description="มีอีกตั้งหลายอย่าง ที่อยากทำกับเธอ"
      />
      <div className="explore-banner">
        <Telescope size={44} />
        <div>
          <h2>เติมวันธรรมดาให้เป็นวันของเรา</h2>
          <p>ไม่ต้องไปไกล แค่ลองอะไรใหม่ ๆ ด้วยกัน</p>
        </div>
        <span className="banner-stars">✦ ✧</span>
      </div>
      <div className="explore-grid">
        {tools.map((t) => (
          <Link
            href={`/explore/${t.id}`}
            className="panel explore-card"
            key={t.id}
          >
            <div className="between">
              <span className={`icon-tile ${t.color}`}>
                <t.icon size={27} />
              </span>
              <ArrowUpRight size={19} />
            </div>
            <p className="eyebrow">{t.name}</p>
            <h2>{t.title}</h2>
            <p className="muted">{t.detail}</p>
            <small className="muted">
              {[
                "dates",
                "wishlist",
                "calendar",
                "memories",
                "letters",
                "mood",
                "pet",
              ].includes(t.id)
                ? "เชื่อมบัญชีร่วมกันได้"
                : "Demo ในเครื่อง"}
            </small>
          </Link>
        ))}
      </div>
    </>
  );
}
function MoodTool() {
  const journal = useJournal();
  return (
    <>
      <section className="panel">
        <SectionTitle
          title="พื้นที่สำหรับทุกความรู้สึก"
          detail="เลือกชื่อของตัวเอง แล้วบอกความรู้สึกของวันนี้"
        />
        <MoodCheckin />
      </section>
      <section className="panel">
        <SectionTitle
          title="บันทึกหัวใจของเรา"
          detail={
            journal.demo ? undefined : "ความรู้สึกล่าสุด 60 รายการของเราสองคน"
          }
        />
        {journal.moods.length ? (
          [...journal.moods]
            .sort((a, b) => b.day.localeCompare(a.day))
            .map((m) => (
              <div className="history-row" key={m.id}>
                <HeartPulse size={20} />
                <div>
                  <strong>
                    {m.name} · {m.mood}
                  </strong>
                  <p className="muted text-sm">
                    {dateLabel(m.day)}
                    {m.note ? ` · ${m.note}` : ""}
                  </p>
                </div>
              </div>
            ))
        ) : (
          <Empty>เริ่มบันทึกความรู้สึกแรกของวันนี้</Empty>
        )}
      </section>
    </>
  );
}
export function ExploreTool({ tool }: { tool: string }) {
  const t = tools.find((t) => t.id === tool)!;
  const views: Record<string, React.ReactNode> = {
    dates: <DatesTool />,
    wishlist: <WishlistTool />,
    calendar: <CalendarTool />,
    memories: <MemoriesTool />,
    letters: <LettersTool />,
    mood: <MoodTool />,
    roulette: <RouletteTool />,
    pet: <PetTool />,
  };
  return (
    <>
      <Link className="text-link back-link" href="/explore">
        <ArrowLeft size={17} />
        กลับ Explore
      </Link>
      <PageHeading
        eyebrow={t.name.toUpperCase()}
        title={t.title}
        description={t.detail}
      />
      {["memories", "letters", "mood"].includes(tool) && (
        <QuestStatus label={t.title} />
      )}
      {views[tool]}
    </>
  );
}
