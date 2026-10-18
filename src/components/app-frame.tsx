"use client";
import { usePathname } from "next/navigation";
import { WorldProvider } from "@/lib/world-store";
import { QuestProvider } from "@/lib/quest-store";
import { AppShell } from "./app-shell";
export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (/^\/(login|register|account|pairing|auth)(\/|$)/.test(pathname))
    return children;
  return (
    <WorldProvider>
      <QuestProvider>
        <AppShell>{children}</AppShell>
      </QuestProvider>
    </WorldProvider>
  );
}
