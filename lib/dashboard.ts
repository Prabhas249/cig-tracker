import type { SocialEvent } from "./social-types";
import { getZonedParts } from "./time";
export function dashboard(events: SocialEvent[], timezone: string, now = new Date()) {
  const today = getZonedParts(now, timezone).localDate;
  const dateKeys = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 6 + i);
    return d.toISOString().slice(0, 10);
  });
  const originalEvents = events;
  events = events.map(e => ({ ...e, localDate: getZonedParts(new Date(e.loggedAt), timezone).localDate }));
  const cigs = events.filter(e => e.kind === "cig");
  const todays = events.filter(e => e.localDate === today);
  const week = cigs.filter(e => dateKeys.includes(e.localDate));
  const spent = (rows: SocialEvent[]) => rows.reduce((s, e) => s + e.quantity * e.unitCostInr, 0);
  const count = (rows: SocialEvent[]) => rows.reduce((s, e) => s + e.quantity, 0);
  const loggedDays = new Set(week.map(e => e.localDate)).size;
  const sorted = [...originalEvents].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  return {
    today, todayCigs: count(todays.filter(e => e.kind === "cig")), todayDrinks: count(todays.filter(e => e.kind === "drink")),
    todaySpend: spent(todays), weekCount: count(week), weekSpend: spent(week), loggedDays,
    average: loggedDays ? count(week) / loggedDays : 0, totalSpend: spent(events), sorted,
    last: sorted.find(e => e.kind === "cig")?.loggedAt ?? null,
    days: dateKeys.map(date => ({ date,
      label: new Date(date + "T12:00:00Z").toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" }),
      count: count(cigs.filter(e => e.localDate === date)),
    })),
  };
}
export function timeSince(iso: string | null, now: number) {
  if (!iso) return "No logs yet";
  const mins = Math.max(0, Math.floor((now - Date.parse(iso)) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`;
}
