"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Heart,
  House,
  ListChecks,
  PiggyBank,
  Compass,
  Users,
  Sprout,
  MonitorSmartphone,
  CalendarHeart,
} from "lucide-react";
import { useWorld } from "@/lib/world-store";
import { useQuests } from "@/lib/quest-store";
import { usePlanning } from "@/lib/planning-store";
import { today, dateLabel, isSharedPath } from "@/lib/utils";
const nav = [
  { href: "/", name: "Home", thai: "บ้านของเรา", icon: House },
  { href: "/quests", name: "Quest", thai: "ภารกิจ", icon: ListChecks },
  { href: "/savings", name: "Savings", thai: "กระปุกออมเงิน", icon: PiggyBank },
  { href: "/explore", name: "Explore", thai: "ออกสำรวจ", icon: Compass },
  { href: "/us", name: "Us", thai: "เราสองคน", icon: Users },
];
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { world, storageError } = useWorld();
  const { status, profile } = useQuests();
  const { dates } = usePlanning();
  const sharedPage = isSharedPath(pathname);
  const shared = sharedPage && status === "paired";
  const names = sharedPage && status !== "demo" ? profile : world.profile;
  function active(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }
  const upcoming = (sharedPage ? dates : world.dates).filter(
    (d) => d.day === today(),
  );
  return (
    <>
      <div className="app-layout">
        <aside className="sidebar">
          <Link href="/" className="brand" prefetch={false}>
            <span className="brand-icon">
              <Heart size={23} fill="currentColor" />
            </span>
            <span>
              our little
              <span>
                world<span className="brand-dot">.</span>
              </span>
            </span>
          </Link>
          <p className="sidebar-caption">โลกใบเล็กของเราสองคน</p>
          <nav aria-label="เมนูหลัก Desktop">
            {nav.map((n) => (
              <Link
                className={`nav-link ${active(n.href) ? "active" : ""}`}
                href={n.href}
                prefetch={false}
                key={n.href}
                aria-current={active(n.href) ? "page" : undefined}
              >
                <n.icon size={20} />
                <span>
                  {n.thai}
                  <small>{n.name}</small>
                </span>
                {active(n.href) && <i />}
              </Link>
            ))}
          </nav>
          <div className="sidebar-note">
            <Sprout size={28} />
            <p>
              ความรักเติบโต
              <br />
              ในเรื่องเล็ก ๆ ทุกวัน
            </p>
            <span>made for just the two of us</span>
          </div>
          <div className="sidebar-couple">
            <span className="avatar avatar-0">{names.name1.slice(0, 1)}</span>
            <div>
              <strong>
                {names.name1} & {names.name2}
              </strong>
              <small>our happy little space</small>
            </div>
            <Heart size={15} />
          </div>
        </aside>
        <div className="main-column">
          <header className="topbar">
            <span className="topbar-title">
              Our little world <Heart size={13} />
            </span>
            <span className="desktop-date">{dateLabel(today())}</span>
            <span className="demo-badge">
              <span />
              {shared
                ? "SHARED · D1"
                : sharedPage && status !== "demo"
                  ? "บัญชีของเรา"
                  : "DEMO MODE"}
            </span>
            <Link
              className="topbar-avatar avatar avatar-0"
              href={sharedPage && status !== "demo" ? "/account" : "/us"}
              prefetch={false}
              aria-label="ข้อมูลเราสองคน"
            >
              {names.name1.slice(0, 1)}
            </Link>
          </header>
          <main id="main" tabIndex={-1}>
            <div className="demo-notice">
              <MonitorSmartphone size={14} />
              <span>
                {sharedPage && status !== "demo"
                  ? "ภารกิจ หัวใจ เงินออม แผน Mood ความทรงจำ จดหมาย แมว และ Achievement ใช้บัญชีร่วมกัน"
                  : "พื้นที่ทดลองของเรา · ข้อมูล Demo และหัวใจ Demo แยกจากบัญชีจริง"}
              </span>
            </div>
            {storageError && (
              <div className="error-banner" role="alert">
                {storageError}
              </div>
            )}
            {world.profile.reminders && upcoming.length > 0 && (
              <Link href="/explore/dates" className="notice" prefetch={false}>
                <CalendarHeart size={17} />
                วันนี้มีนัด:{" "}
                {upcoming.map((d) => `${d.title} ${d.time} น.`).join(", ")}
              </Link>
            )}
            <div key={pathname}>{children}</div>
          </main>
        </div>
        <nav className="bottom-nav" aria-label="เมนูหลัก Mobile">
          {nav.map((n) => (
            <Link
              className={active(n.href) ? "active" : ""}
              href={n.href}
              prefetch={false}
              key={n.href}
              aria-current={active(n.href) ? "page" : undefined}
            >
              <span>
                <n.icon size={21} />
              </span>
              <small>{n.name}</small>
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
