"use client";
import Link from "next/link";
import { Heart, LockKeyhole, Users } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";
import { LogoutButton, AddPasskeyButton } from "@/components/auth-forms";
import { RefreshAccount, UpdateNameForm } from "@/components/pairing-forms";
import { useAccount } from "@/lib/account";
import { Button } from "@/components/ui/button";
import { dateLabel } from "@/lib/utils";
export default function Page() {
  const { context, error, refresh } = useAccount();
  if (!context)
    return (
      <AuthLayout title="บ้านของบัญชีเรา" description="กำลังตรวจสอบบัญชีของคุณ">
        <p role={error ? "alert" : "status"}>{error || "กำลังโหลด…"}</p>
        {error && <RefreshAccount onRefresh={refresh} />}
      </AuthLayout>
    );
  const couple = context.couple;
  return (
    <AuthLayout
      title="บ้านของบัญชีเรา"
      description="บัญชีจริงบน Cloudflare · ข้อมูลสมาชิกแยกตามคู่"
    >
      <div className="editor-form">
        <div className="online-account">
          <span className="tag">
            <LockKeyhole size={13} />
            เข้าสู่ระบบแล้ว
          </span>
          <h2>{context.profile.display_name}</h2>
          <p className="muted text-sm">@{context.profile.username}</p>
        </div>
        {couple ? (
          <section className="cloud-couple">
            <div className="between">
              <h2>
                <Users size={18} />
                คู่ของเรา
              </h2>
              <span className="tag">{couple.members.length}/2 คน</span>
            </div>
            <div className="cloud-members">
              {couple.members.map((m, i) => (
                <div key={m.id}>
                  <span className={"avatar avatar-" + i}>
                    {m.display_name.slice(0, 1)}
                  </span>
                  <strong>{m.display_name}</strong>
                  {m.id === context.profile.id && <small>คุณ</small>}
                </div>
              ))}
            </div>
            <p className="muted text-sm">
              <Heart size={14} />
              เริ่มคบกัน {dateLabel(couple.anniversary)}
            </p>
            {couple.members.length < 2 && (
              <Button asChild>
                <Link href="/pairing">ชวนอีกคนมาจับคู่</Link>
              </Button>
            )}
          </section>
        ) : (
          <div className="notice">
            บัญชีนี้ยังไม่ได้จับคู่{" "}
            <Link href="/pairing" className="text-link">
              เริ่มจับคู่บัญชี
            </Link>
          </div>
        )}
        {error && (
          <p role="alert" className="error-banner">
            {error}
          </p>
        )}
        <RefreshAccount onRefresh={refresh} />
        <UpdateNameForm
          name={context.profile.display_name}
          onRefresh={refresh}
        />
        <div className="notice">
          ภารกิจ รางวัล หัวใจ เงินออม แผนเดต Wishlist และปฏิทินใช้ร่วมกันผ่าน D1
          แล้ว รวมถึง Mood ความทรงจำ จดหมาย แมว ไอเทม และ Achievement
          ข้อมูลตัวอย่างไม่ถูกอัปโหลดอัตโนมัติ
        </div>
        <Button variant="secondary" asChild>
          <Link href={couple ? "/quests" : "/pairing"}>
            {couple ? "ไปภารกิจของเรา" : "ไปจับคู่บัญชี"}
          </Link>
        </Button>
        <AddPasskeyButton />
        <LogoutButton />
      </div>
    </AuthLayout>
  );
}
