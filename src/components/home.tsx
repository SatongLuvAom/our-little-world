"use client";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  CalendarDays,
  Heart,
  Sparkles,
  Sun,
  MapPin,
  Check,
  PiggyBank,
} from "lucide-react";
import { usePet } from "@/lib/pet-store";
import { usePlanning } from "@/lib/planning-store";
import { useQuests } from "@/lib/quest-store";
import { today, money, dateLabel } from "@/lib/utils";
import { CatScene } from "./cat-scene";
import { QuestList, QuestStatus } from "./quests";
import { MoodCheckin, Progress, SectionTitle } from "./shared";
export function HomePage() {
  const { pet } = usePet();
  const { wallet, profile, todayCompletionCount } = useQuests();
  const { dates, goals } = usePlanning();
  const day = today();
  const days = Math.max(
    0,
    Math.floor(
      (Date.parse(`${day}T00:00:00+07:00`) -
        Date.parse(`${profile.since}T00:00:00+07:00`)) /
        86400000,
    ),
  );
  const date = dates
    .filter((d) => d.day >= day)
    .sort((a, b) => `${a.day}${a.time}`.localeCompare(`${b.day}${b.time}`))[0];
  const goal = goals[0];
  return (
    <>
      <QuestStatus label="ภารกิจ หัวใจ เงินออม และแผนของเรา" />
      <div className="home-greeting">
        <div>
          <p className="eyebrow">
            <Sun size={14} /> A LITTLE LOVE, EVERY DAY
          </p>
          <h1>
            โลกใบเล็กของ
            <span>
              เราสองคน<span className="heading-heart">♡</span>
            </span>
          </h1>
          <p className="muted">
            วันนี้ก็ดีใจที่มีเธออยู่ด้วยนะ, {profile.name1} & {profile.name2}
          </p>
        </div>
        <div className="couple-avatars">
          <span className="avatar avatar-0">{profile.name1.slice(0, 1)}</span>
          <Heart size={14} fill="currentColor" />
          <span className="avatar avatar-1">{profile.name2.slice(0, 1)}</span>
        </div>
      </div>
      <div className="home-top-grid">
        <section className="world-card">
          <div className="world-card-copy">
            <div className="soft-badge">
              <span className="live-dot" /> OUR HAPPY PLACE
            </div>
            <h2>
              มีเธอ มีเรา
              <br />
              มีบ้านหลังเล็กของเรา
            </h2>
            <p>
              ไม่ต้องเป็นวันที่พิเศษ
              <br />
              แค่ได้ใช้วันธรรมดาด้วยกันก็พอ
            </p>
            <Link href="/explore/pet" className="scene-link">
              ไปเล่นกับ{pet.name}
              <ArrowUpRight size={16} />
            </Link>
          </div>
          <CatScene name={pet.name} hat={pet.wearing === "mint-hat"} />
          <div className="together-badge">
            <Heart size={15} fill="currentColor" />
            <span>
              เดินข้างกันมา <strong>{days.toLocaleString("th-TH")}</strong> วัน
            </span>
          </div>
        </section>
        <div className="home-side">
          <section className="hearts-card">
            <div className="between">
              <span className="eyebrow">LOVE WALLET</span>
              <Heart size={21} />
            </div>
            <strong>
              {wallet}
              <span>หัวใจของเรา</span>
            </strong>
            <p>ความใส่ใจเล็ก ๆ สะสมเป็นสิ่งดี ๆ</p>
            <Link href="/quests?tab=rewards" className="text-link">
              แวะร้านรางวัล
              <ArrowRight size={15} />
            </Link>
            <Heart className="wallet-heart" size={100} />
          </section>
          <section className="daily-note">
            <span className="note-pin" />
            <Sparkles size={20} />
            <p>
              “โลกข้างนอกจะวุ่นวายแค่ไหน
              <br />
              กลับมาเป็นที่สบายใจให้กันนะ”
            </p>
            <span>บันทึกเล็ก ๆ ถึงเราสองคน</span>
          </section>
        </div>
      </div>
      <div className="home-main-grid">
        <section className="panel home-quests">
          <SectionTitle
            title="ภารกิจเล็ก ๆ ของวันนี้"
            detail="เพราะความรักอยู่ในสิ่งที่เราทำให้กัน"
            action={
              <Link className="text-link" href="/quests">
                ดูทั้งหมด
                <ArrowRight size={15} />
              </Link>
            }
          />
          <QuestList limit={3} />
          <div className="quest-footer">
            <span className="mini-check">
              <Check size={13} />
            </span>
            วันนี้ทำสำเร็จ {todayCompletionCount} ครั้ง
            <span className="muted">· ค่อย ๆ เติบโตไปด้วยกัน</span>
          </div>
        </section>
        <section className="panel mood-card">
          <SectionTitle
            title="วันนี้หัวใจเป็นยังไงบ้าง?"
            detail="ไม่ว่าจะรู้สึกแบบไหน เราอยู่ตรงนี้เสมอ"
          />
          <MoodCheckin />
        </section>
        <section className="panel home-savings">
          <SectionTitle
            title="เก็บเล็กผสมน้อย"
            action={
              <Link
                href="/savings"
                className="round-link"
                aria-label="ไปหน้ากระปุกออมเงิน"
              >
                <ArrowUpRight size={18} />
              </Link>
            }
          />
          {goal ? (
            <>
              <div className="savings-preview">
                <span className="icon-tile mint">
                  <PiggyBank size={27} />
                </span>
                <div>
                  <h3>{goal.title}</h3>
                  <p className="muted text-sm">ความฝันที่เราอยากทำด้วยกัน</p>
                </div>
              </div>
              <div className="between saving-numbers">
                <strong>฿{money(goal.total_cents / 100)}</strong>
                <span className="muted text-sm">จาก ฿{money(goal.target)}</span>
              </div>
              <Progress
                value={(goal.total_cents / 100 / goal.target) * 100}
                label={goal.title}
              />
              <p className="muted text-sm">
                อีก ฿{money(Math.max(0, goal.target - goal.total_cents / 100))}{" "}
                ก็ถึงความฝันแล้ว ♡
              </p>
            </>
          ) : (
            <Link href="/savings">
              สร้างความฝันแรกของเรา
              <ArrowRight size={16} />
            </Link>
          )}
        </section>
        <section className="panel home-date">
          <SectionTitle
            title="นัดครั้งต่อไปของเรา"
            action={<CalendarDays size={19} />}
          />
          {date ? (
            <>
              <div className="date-preview">
                <div className="date-square">
                  <span>
                    {new Intl.DateTimeFormat("th-TH", {
                      month: "short",
                    }).format(new Date(`${date.day}T12:00:00+07:00`))}
                  </span>
                  <strong>{date.day.slice(8)}</strong>
                </div>
                <div>
                  <h3>{date.title}</h3>
                  <p className="muted text-sm">
                    <MapPin size={13} />
                    {date.place}
                  </p>
                  <p className="muted text-sm">
                    {dateLabel(date.day)} · {date.time} น.
                  </p>
                </div>
              </div>
              <Link href="/explore/dates" className="text-link">
                เก็บเวลานี้ไว้ให้กัน
                <ArrowRight size={15} />
              </Link>
            </>
          ) : (
            <Link href="/explore/dates" className="text-link">
              วางแผนเดตแรกของเรา
              <ArrowRight size={15} />
            </Link>
          )}
        </section>
      </div>
      <p className="home-signoff">
        a little world. a whole lot of love. <Heart size={12} />
      </p>
    </>
  );
}
