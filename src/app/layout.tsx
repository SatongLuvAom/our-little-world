import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { AppFrame } from "@/components/app-frame";
import { PwaProvider } from "@/components/pwa";
import "@fontsource/ibm-plex-sans-thai/400.css";
import "@fontsource/ibm-plex-sans-thai/500.css";
import "@fontsource/ibm-plex-sans-thai/600.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Our Little World — โลกใบเล็กของเราสองคน",
    template: "%s | Our Little World",
  },
  description: "เก็บความทรงจำ สร้างความฝัน และดูแลกันในทุกวัน · Demo Mode",
  applicationName: "Our Little World",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Our World" },
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FFF8F4",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>
        <a href="#main" className="skip-link">
          ข้ามไปเนื้อหา
        </a>
        <PwaProvider>
          <AppFrame>{children}</AppFrame>
        </PwaProvider>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
