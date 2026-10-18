"use client";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { accountMutation } from "@/lib/account";
import type { AuthResult, PairResult, AccountContext } from "@/lib/auth-schema";
import { today } from "@/lib/utils";
import { FormResult } from "./auth-forms";
import { Button } from "./ui/button";
type RefreshProps = { onRefresh: () => Promise<void> };
export function CreateCoupleForm({ onRefresh }: RefreshProps) {
  const [result, action, pending] = useActionState<AuthResult, FormData>(
    async (_, form) => {
      const result = await accountMutation("couple", form);
      if (!result.error) await onRefresh();
      return result;
    },
    {},
  );
  return (
    <form action={action} className="editor-form">
      <h2>สร้างพื้นที่ของเราสองคน</h2>
      <p className="muted text-sm">
        คนแรกสร้างคู่ แล้วส่งรหัสเชิญให้อีกคน ไม่ต้องสร้างคู่แยกกัน
      </p>
      <div className="form-field">
        <label htmlFor="anniversary">วันที่เริ่มคบกัน</label>
        <input
          id="anniversary"
          name="anniversary"
          type="date"
          min="1900-01-01"
          max={today()}
          defaultValue={today()}
          required
        />
      </div>
      <FormResult result={result} />
      <Button disabled={pending} type="submit">
        {pending ? "กำลังสร้าง…" : "สร้างคู่ของเรา"}
      </Button>
    </form>
  );
}
export function AcceptInvitationForm() {
  const router = useRouter();
  const [result, action, pending] = useActionState<AuthResult, FormData>(
    async (_, form) => {
      const result = await accountMutation("accept", form);
      if (!result.error) router.replace("/account");
      return result;
    },
    {},
  );
  return (
    <form action={action} className="editor-form">
      <h2>ได้รับรหัสจากอีกคนแล้ว?</h2>
      <p className="muted text-sm">
        วางรหัส 64 ตัวจากอีกคนเพื่อเข้าร่วมคู่ บัญชีหนึ่งอยู่ได้เพียงคู่เดียว
      </p>
      <div className="form-field">
        <label htmlFor="invite-token">รหัสคำเชิญ</label>
        <textarea
          id="invite-token"
          name="token"
          rows={3}
          required
          maxLength={64}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={!!result.fields?.token}
        />
      </div>
      <FormResult result={result} />
      <Button disabled={pending} type="submit">
        {pending ? "กำลังจับคู่…" : "จับคู่บัญชี"}
      </Button>
    </form>
  );
}
export function InvitationForm({
  invitation,
  onRefresh,
}: {
  invitation: NonNullable<AccountContext["couple"]>["invitation"];
} & RefreshProps) {
  const [result, action, pending] = useActionState<PairResult>(async () => {
    const result = await accountMutation("invitation");
    if (!result.error) await onRefresh();
    return result;
  }, {});
  const [revokeResult, revokeAction, revoking] = useActionState<
    AuthResult,
    FormData
  >(async (_, form) => {
    const result = await accountMutation("revoke", form);
    if (!result.error) await onRefresh();
    return result;
  }, {});
  const visibleToken =
    invitation && result.invitationId === invitation.id ? result.token : null;
  return (
    <div className="editor-form">
      <h2>ชวนอีกคนเข้ามาอยู่ด้วยกัน</h2>
      <p className="muted text-sm">
        รหัสใช้ได้ครั้งเดียวภายใน 24 ชั่วโมง ระบบเก็บเฉพาะ hash ของรหัส
        การสร้างใหม่จะยกเลิกรหัสเดิม
      </p>
      <form action={action}>
        <Button type="submit" disabled={pending || revoking}>
          {pending
            ? "กำลังสร้างรหัส…"
            : invitation
              ? "สร้างรหัสใหม่แทนรหัสเดิม"
              : "สร้างรหัสคำเชิญ"}
        </Button>
      </form>
      <FormResult result={result} />
      {visibleToken && (
        <div className="invitation-token">
          <label htmlFor="created-token">รหัสสำหรับส่งให้อีกคน</label>
          <textarea
            id="created-token"
            value={visibleToken}
            readOnly
            rows={3}
            spellCheck={false}
          />
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(visibleToken);
                toast.success("คัดลอกรหัสแล้ว");
              } catch {
                toast.error(
                  "คัดลอกอัตโนมัติไม่ได้ เลือกและคัดลอกรหัสจากช่องด้านบน",
                );
              }
            }}
          >
            <Copy size={16} />
            คัดลอกรหัส
          </Button>
          <p className="muted text-sm">
            รหัสแสดงในหน้านี้ครั้งเดียว เมื่อ Refresh
            ต้องสร้างรหัสใหม่เพื่อดูอีกครั้ง
          </p>
        </div>
      )}
      {invitation && (
        <form action={revokeAction} className="editor-form">
          <input type="hidden" name="invitation_id" value={invitation.id} />
          <p className="muted text-sm">
            หมดอายุ{" "}
            {new Intl.DateTimeFormat("th-TH", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Bangkok",
            }).format(new Date(invitation.expires_at))}
          </p>
          <Button
            type="submit"
            variant="destructive"
            disabled={revoking || pending}
          >
            ยกเลิกรหัสคำเชิญ
          </Button>
          <FormResult result={revokeResult} />
        </form>
      )}
    </div>
  );
}
export function RefreshAccount({ onRefresh }: RefreshProps) {
  return (
    <Button variant="secondary" onClick={() => void onRefresh()}>
      <RefreshCw size={16} />
      ตรวจสอบการจับคู่
    </Button>
  );
}
export function UpdateNameForm({
  name,
  onRefresh,
}: { name: string } & RefreshProps) {
  const [result, action, pending] = useActionState<AuthResult, FormData>(
    async (_, form) => {
      const result = await accountMutation("profile", form);
      if (!result.error) await onRefresh();
      return result;
    },
    {},
  );
  return (
    <form action={action} className="editor-form">
      <div className="form-field">
        <label htmlFor="account-name">ชื่อของคุณ</label>
        <input
          id="account-name"
          name="display_name"
          defaultValue={name}
          maxLength={120}
          required
        />
      </div>
      <FormResult result={result} />
      <Button variant="secondary" disabled={pending} type="submit">
        บันทึกชื่อ
      </Button>
    </form>
  );
}
