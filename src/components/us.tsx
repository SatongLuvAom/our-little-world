"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Download,
  ShieldCheck,
  Heart,
  Trophy,
  Check,
  Pencil,
  Bell,
  RotateCcw,
  Cat,
  LockKeyhole,
} from "lucide-react";
import { useWorld } from "@/lib/world-store";
import { profileSchema } from "@/lib/model";
import { usePet } from "@/lib/pet-store";
import { usePlanning } from "@/lib/planning-store";
import { useJournal } from "@/lib/journal-store";
import { QuestStatus } from "./quests";
import { dateLabel } from "@/lib/utils";
import { Editor, PageHeading, SectionTitle } from "./shared";
import { Button } from "./ui/button";
import { Sheet } from "./ui/dialog";
import { BackupTools } from "./backup-tools";
import { PwaTools } from "./pwa";
import { DiagnosticTools } from "./diagnostic-tools";
import { PushTools } from "./push-tools";
export function UsPage() {
  const { world, update, reset, exportData } = useWorld();
  const [confirm, setConfirm] = useState(false);
  const {
    achievements: badges,
    profile,
    wallet,
    completionCount,
    demo,
    ready,
  } = usePet();
  const { dates } = usePlanning(),
    { memories } = useJournal();
  const icons: Record<string, typeof Check> = {
    "first-quest": Check,
    "team-ten": Trophy,
    "pet-favorite": Cat,
  };
  const achievements = badges.map((a) => ({
    ...a,
    done: a.unlocked_at !== null,
    icon: icons[a.id] || Trophy,
  }));
  return (
    <>
      <QuestStatus label="ความสำเร็จของเราสองคน" ready={ready} />
      <PageHeading
        eyebrow="YOU + ME = OUR LITTLE WORLD"
        title="เรื่องของเราสองคน"
        description="บ้านที่อบอุ่น เพราะมีเราอยู่ด้วยกัน"
      />
      <PwaTools />
      <PushTools />
      <DiagnosticTools />
      <section className="panel profile-hero">
        <div className="profile-avatars">
          <span className="avatar avatar-0">{profile.name1.slice(0, 1)}</span>
          <Heart size={24} fill="currentColor" />
          <span className="avatar avatar-1">{profile.name2.slice(0, 1)}</span>
        </div>
        <h2>
          {profile.name1} & {profile.name2}
        </h2>
        <p className="muted">
          เริ่มเขียนเรื่องของเรา ตั้งแต่ {dateLabel(profile.since)}
        </p>
        {demo ? (
          <Editor
            title="แก้ไขข้อมูลของเรา"
            schema={profileSchema.omit({ reminders: true })}
            values={world.profile}
            trigger={<Pencil size={17} />}
            fields={[
              { name: "name1", label: "ชื่อเรา" },
              { name: "name2", label: "ชื่อเธอ" },
              { name: "since", label: "วันที่เริ่มคบกัน", type: "date" },
              { name: "petName", label: "ชื่อแมวของเรา" },
            ]}
            onSave={(data) =>
              update(
                (s) => ({ ...s, profile: { ...s.profile, ...data } }),
                "บันทึกเรื่องของเราแล้ว",
              )
            }
          />
        ) : (
          <Button asChild variant="secondary">
            <Link href="/account">ข้อมูลบัญชีและคู่ของเรา</Link>
          </Button>
        )}
      </section>
      <div className="profile-stats">
        <div>
          <strong>{completionCount}</strong>
          <span>ภารกิจสำเร็จ</span>
        </div>
        <div>
          <strong>{wallet}</strong>
          <span>หัวใจที่ใช้ได้</span>
        </div>
        <div>
          <strong>{memories.length}</strong>
          <span>ความทรงจำ</span>
        </div>
        <div>
          <strong>{dates.length}</strong>
          <span>นัดของเรา</span>
        </div>
      </div>
      <section className="panel">
        <SectionTitle title="ความสำเร็จที่สร้างด้วยกัน" />
        <div className="achievement-grid">
          {achievements.map((a) => (
            <div
              className={`achievement ${a.done ? "unlocked" : ""}`}
              key={a.title}
            >
              <span className="icon-tile lavender">
                <a.icon size={26} />
              </span>
              <h3>{a.title}</h3>
              <p className="muted text-sm">{a.detail}</p>
              <span className="tag">
                {a.done ? "ปลดล็อกแล้ว" : "กำลังสะสมเรื่องราว"}
              </span>
            </div>
          ))}
        </div>
      </section>
      <BackupTools />
      <section className="panel settings">
        <SectionTitle title="ดูแลโลกใบเล็กของเรา" />
        <div className="setting-row">
          <Bell size={21} />
          <div>
            <h3>การ์ดเตือนภายในแอป</h3>
            <p className="muted text-sm">
              แสดงคำเตือนเมื่อมีนัดวันนี้ · ยังไม่มี Push Notification
            </p>
          </div>
          <button
            role="switch"
            aria-checked={world.profile.reminders}
            aria-label="การ์ดเตือนภายในแอป"
            className={`switch ${world.profile.reminders ? "on" : ""}`}
            onClick={() =>
              update(
                (s) => ({
                  ...s,
                  profile: { ...s.profile, reminders: !s.profile.reminders },
                }),
                "บันทึกการตั้งค่าแล้ว",
              )
            }
          >
            <span />
          </button>
        </div>
        <div className="setting-row">
          <ShieldCheck size={21} />
          <div>
            <h3>
              {demo ? "ความเป็นส่วนตัวใน Demo Mode" : "พื้นที่ส่วนตัวของคู่เรา"}
            </h3>
            <p className="muted text-sm">
              {demo ? (
                <>
                  ข้อมูลอยู่ใน Browser ของเครื่องนี้
                  ไม่มีบัญชีจริงหรือการซิงก์ระหว่างคน รูปและจดหมายยังไม่เข้ารหัส
                  หลีกเลี่ยงข้อมูลละเอียดอ่อน
                </>
              ) : (
                "ข้อมูลร่วมกันเก็บใน D1 และตรวจ session กับสิทธิ์สมาชิกทุกคำขอ รูปใช้ลิงก์ส่วนตัวอายุสั้น"
              )}
            </p>
          </div>
        </div>
        <div className="setting-row">
          <Download size={21} />
          <div>
            <h3>
              {demo ? "ส่งออกข้อมูลของเรา" : "ส่งออกข้อมูล Demo ในเครื่อง"}
            </h3>
            <p className="muted text-sm">
              {demo
                ? "ดาวน์โหลด JSON เพื่อสำรองข้อมูล รวมรูปและจดหมาย"
                : "ดาวน์โหลดเฉพาะ Demo ไม่รวมข้อมูลบัญชีจริงใน D1"}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={exportData}>
            ส่งออก
          </Button>
        </div>
        <div className="setting-row">
          <RotateCcw size={21} />
          <div>
            <h3>เริ่ม Demo ใหม่</h3>
            <p className="muted text-sm">
              ล้างข้อมูลในเครื่อง แล้วกลับไปใช้ข้อมูลตัวอย่าง
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirm(true)}
          >
            ล้างข้อมูล
          </Button>
        </div>
        <div className="account-note">
          <LockKeyhole size={18} />
          <p>
            {demo
              ? "บัญชีจริงแยกจาก Demo นี้ ข้อมูลตัวอย่างจะไม่ถูกอัปโหลดไป Cloudflare อัตโนมัติ"
              : "ส่งออกและเริ่ม Demo ใหม่มีผลเฉพาะข้อมูลในเครื่อง ไม่ลบหรือเปลี่ยนข้อมูล D1 ของคู่เรา"}
          </p>
        </div>
        <div className="row-actions account-links">
          <Button asChild>
            <Link href="/account">บัญชีจริงและการจับคู่</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/register">สมัครสมาชิก</Link>
          </Button>
        </div>
      </section>
      <Sheet
        open={confirm}
        onOpenChange={setConfirm}
        title="เริ่มโลกตัวอย่างใหม่?"
        description="ข้อมูลที่เพิ่มทั้งหมด รวมรูปภาพ จดหมาย และยอดออมใน Browser นี้จะถูกแทนที่ ส่งออกข้อมูลเก็บไว้ก่อนหากต้องการ"
      >
        <div className="row-actions">
          <Button variant="secondary" onClick={exportData}>
            ส่งออกข้อมูลก่อน
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              reset();
              setConfirm(false);
            }}
          >
            ยืนยันล้างข้อมูล
          </Button>
        </div>
      </Sheet>
    </>
  );
}
