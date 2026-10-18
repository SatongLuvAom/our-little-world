import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export const isSharedPath = (path: string) =>
  [
    "/",
    "/quests",
    "/savings",
    "/explore",
    "/explore/dates",
    "/explore/wishlist",
    "/explore/calendar",
    "/explore/memories",
    "/explore/letters",
    "/explore/mood",
    "/explore/pet",
    "/us",
  ].includes(path);
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const money = (value: number) =>
  new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(value);
export const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value.length === 10 ? `${value}T12:00:00+07:00` : value));
