const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export type ZonedParts = {
  localDate: string;
  localTime: string;
  weekday: number;
  hour: number;
  minute: number;
  month: number;
  year: number;
  isoWeek: number;
};

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  const hour = Number(map.hour);
  const minute = Number(map.minute);
  return {
    localDate: `${year}-${map.month}-${map.day}`,
    localTime: `${map.hour}:${map.minute}`,
    weekday: WEEKDAY[map.weekday] ?? 0,
    hour,
    minute,
    month,
    year,
    isoWeek: isoWeekFromYmd(year, month, day),
  };
}

function isoWeekFromYmd(year: number, month: number, day: number): number {
  const utc = Date.UTC(year, month - 1, day);
  const date = new Date(utc);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function fmtMins(mins: number): string {
  if (mins < 60) return `${Math.round(mins)}m`;
  if (mins < 60 * 24) {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(mins / (60 * 24));
  const h = Math.round((mins % (60 * 24)) / 60);
  return h ? `${d}d ${h}h` : `${d}d`;
}

export const fmtINR = (n: number) => {
  const rounded = Math.round(n * 100) / 100;
  const digits = Number.isInteger(rounded) ? 0 : 2;
  return "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(rounded);
};

export function dayPart(hour: number): "night" | "morning" | "afternoon" | "evening" | "late" {
  if (hour < 6) return "night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "late";
}

export function cityFromTimezone(tz: string): string {
  if (tz === "Asia/Calcutta" || tz === "Asia/Kolkata") return "India · IST";
  const leaf = tz.split("/")[1] ?? tz;
  return leaf.replace(/_/g, " ");
}

export function ymd(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function avgGapMins(timestamps: number[]): number | null {
  if (timestamps.length < 2) return null;
  const sorted = [...timestamps].sort((a, b) => a - b);
  let total = 0;
  for (let i = 1; i < sorted.length; i++) total += sorted[i] - sorted[i - 1];
  return total / (sorted.length - 1) / 60000;
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEKDAYS_MON = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
