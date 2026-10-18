import { AuthLayout } from "@/components/auth-layout";
import { AuthForm } from "@/components/auth-forms";
export const metadata = { title: "เข้าสู่ระบบ" };
export default function Page() {
  return (
    <AuthLayout
      title="กลับมาหากันนะ"
      description="เข้าสู่บัญชีจริงของคุณ แล้วสร้างโลกใบเล็กด้วยกัน"
    >
      <AuthForm mode="login" />
    </AuthLayout>
  );
}
