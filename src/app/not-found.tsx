import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty">
      <h1>หลงทางในโลกใบเล็ก?</h1>
      <p>หน้านี้ไม่มีอยู่ กลับบ้านของเราได้เลย</p>
      <Link className="button button-primary" href="/">
        กลับบ้านของเรา
      </Link>
    </div>
  );
}
