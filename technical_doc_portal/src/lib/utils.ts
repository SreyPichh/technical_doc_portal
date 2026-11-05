import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Calendar dates (YYYY-MM-DD strings) are shown as-is; timestamps use the server's time zone (set TZ in production).
const dateOnlyFmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" });
const dateFmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** ISO-style date (YYYY-MM-DD), matching NSK document conventions. */
export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  if (typeof d === "string" && d.length === 10) {
    const day = new Date(`${d}T00:00:00Z`);
    return Number.isNaN(day.getTime()) ? "—" : dateOnlyFmt.format(day);
  }
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? "—" : dateFmt.format(date);
}

export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return dateTimeFmt.format(typeof d === "string" ? new Date(d) : d);
}
