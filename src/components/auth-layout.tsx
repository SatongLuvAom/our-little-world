import Link from "next/link";
import { Heart, ShieldCheck, ArrowLeft } from "lucide-react";
import { Cat } from "./cat-scene";
export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main id="main" tabIndex={-1} className="auth-layout">
      <Link href="/" className="text-link back-link">
        <ArrowLeft size={16} />
        กลับหน้าหลัก
      </Link>
      <div className="auth-brand">
        <Heart size={23} fill="currentColor" />
        <span>our little world.</span>
      </div>
      <section className="panel auth-panel">
        <div className="auth-mascot">
          <Cat />
        </div>
        <p className="eyebrow">OUR REAL LITTLE WORLD</p>
        <h1>{title}</h1>
        <p className="muted auth-description">{description}</p>
        {children}
      </section>
      <p className="auth-security">
        <ShieldCheck size={16} />
        บัญชีจริงแยกจากข้อมูล Demo ในเครื่อง
      </p>
    </main>
  );
}
