import { AuthLayout } from "@/components/auth-layout";
import { AuthForm } from "@/components/auth-forms";
export const metadata = { title: "สมัครสมาชิก" };
export default function Page() {
  return (
    <AuthLayout
      title="เริ่มเรื่องของเรา"
      description="สมัครด้วย Passkey แล้วชวนอีกคนเข้ามาสร้างโลกใบเล็กด้วยกัน"
    >
      <AuthForm mode="register" />
    </AuthLayout>
  );
}
