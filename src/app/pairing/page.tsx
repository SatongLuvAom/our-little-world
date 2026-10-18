"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthLayout } from "@/components/auth-layout";
import { LogoutButton } from "@/components/auth-forms";
import {
  AcceptInvitationForm,
  CreateCoupleForm,
  InvitationForm,
  RefreshAccount,
} from "@/components/pairing-forms";
import { useAccount } from "@/lib/account";
export default function Page() {
  const { context, error, refresh } = useAccount();
  const router = useRouter();
  const paired = context?.couple?.members.length === 2;
  useEffect(() => {
    if (paired) router.replace("/account");
  }, [paired, router]);
  if (!context || paired)
    return (
      <AuthLayout title="จับคู่บัญชี" description="กำลังตรวจสอบบัญชีของคุณ">
        <p role={error ? "alert" : "status"}>{error || "กำลังโหลด…"}</p>
        {error && <RefreshAccount onRefresh={refresh} />}
      </AuthLayout>
    );
  return (
    <AuthLayout
      title={"มาอยู่ด้วยกันนะ, " + context.profile.display_name}
      description="บัญชีจริง · สมาชิกไม่เกิน 2 คนต่อคู่"
    >
      <div className="editor-form">
        {context.couple ? (
          <>
            <InvitationForm
              invitation={context.couple.invitation}
              onRefresh={refresh}
            />
            <RefreshAccount onRefresh={refresh} />
          </>
        ) : (
          <>
            <CreateCoupleForm onRefresh={refresh} />
            <div className="auth-divider">หรือใช้รหัสจากอีกคน</div>
            <AcceptInvitationForm />
          </>
        )}
        {error && (
          <p role="alert" className="error-banner">
            {error}
          </p>
        )}
        <Link className="text-link" href="/account">
          ไปหน้าบัญชีของฉัน
        </Link>
        <LogoutButton />
      </div>
    </AuthLayout>
  );
}
