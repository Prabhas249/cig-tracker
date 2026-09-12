import { LIFE_MIN_PER_CIG } from "./catalog";
import type { EventRow } from "./schema";
import { avgGapMins, dayPart, startOfDay, WEEKDAYS, ymd } from "./time";

export type DayBrandStat = { day: string; count: number };
export type HourStat = { hour: number; count: number };
export type BrandStat = { name: string; count: number; spend: number };
export type DaySpend = { date: string; cigs: number; drinks: number; spendCig: number; spendDrink: number };

export type Analytics = {
  todayCigs: number;
  todayDrinks: number;
  weekCigs: number;
  monthCigs: number;
  weekDrinks: number;
  monthDrinks: number;
  allCigs: number;
  allDrinks: number;
  spentTodayCig: number;
  spentTodayDrink: number;
  spentMonthCig: number;
  spentMonthDrink: number;
  spentAllCig: number;
  spentAllDrink: number;
  nicToday: number;
  tarToday: number;
  nicAll: number;
  tarAll: number;
  drinksTodayStd: number;
  drinksAllStd: number;
  calToday: number;
  calAll: number;
  lifeToday: number;
  lifeAll: number;
  gapToday: number | null;
  gapWeek: number | null;
  gapAll: number | null;
  lastCigAt: number | null;
  lastDrinkAt: number | null;
  lastAt: number | null;
  smokeFreeStreak: number;
  dryStreak: number;
  smokeFreeThisMonth: number;
  dryThisMonth: number;
  heaviestWeekdayCig: DayBrandStat | null;
  heaviestWeekdayDrink: DayBrandStat | null;
  heaviestHourCig: HourStat | null;
  heaviestHourDrink: HourStat | null;
  topBrandCig: BrandStat | null;
  topBrandDrink: BrandStat | null;
  weekCountsCig: number[];
  weekCountsDrink: number[];
  hourGridCig: number[][];
  hourGridDrink: number[][];
  hourHistCig: number[];
  hourHistDrink: number[];
  weekdayHistCig: number[];
  weekdayHistDrink: number[];
  dayPartCig: Record<string, number>;
  dayPartDrink: Record<string, number>;
  brandCig: BrandStat[];
  brandDrink: BrandStat[];
  brandByWeekdayCig: Record<string, number[]>;
  brandByWeekdayDrink: Record<string, number[]>;
  spendByDay: DaySpend[];
  calendar: Record<string, { cigs: number; drinks: number; spend: number }>;
  smokingDays: number;
  drinkingDays: number;
  avgCigsOnSmokeDays: number | null;
  avgDrinksOnDrinkDays: number | null;
  skuCig: BrandStat[];
  skuDrink: BrandStat[];
  gapDrinkAll: number | null;
  gapDrinkWeek: number | null;
  places: { name: string; count: number; spend: number }[];
  sourceCig: Record<string, number>;
  sourceDrink: Record<string, number>;
};

const EMPTY_PARTS = { night: 0, morning: 0, afternoon: 0, evening: 0, late: 0 };

export function analyze(events: EventRow[], now = Date.now()): Analytics {
  const cigs = events.filter((e) => e.kind === "cig");
  const drinks = events.filter((e) => e.kind === "drink");
  const today0 = startOfDay(now);
  const week0 = today0 - 6 * 86400000;
  const monthStart = (() => {
    const d = new Date(now);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();

  const inRange = (rows: EventRow[], from: number) =>
    rows.filter((e) => new Date(e.loggedAt).getTime() >= from);

  const todayCigs = inRange(cigs, today0);
  const todayDrinks = inRange(drinks, today0);
  const weekCigs = inRange(cigs, week0);
  const weekDrinks = inRange(drinks, week0);
  const monthCigs = inRange(cigs, monthStart);
  const monthDrinks = inRange(drinks, monthStart);

  const sumQty = (rows: EventRow[]) => rows.reduce((s, e) => s + e.quantity, 0);
  const sumCost = (rows: EventRow[]) => rows.reduce((s, e) => s + e.unitCostInr * e.quantity, 0);
  const lastCigAt = cigs.length ? Math.max(...cigs.map((e) => new Date(e.loggedAt).getTime())) : null;
  const lastDrinkAt = drinks.length ? Math.max(...drinks.map((e) => new Date(e.loggedAt).getTime())) : null;

  const calendar: Record<string, { cigs: number; drinks: number; spend: number }> = {};
  for (const e of events) {
    const key = String(e.localDate);
    if (!calendar[key]) calendar[key] = { cigs: 0, drinks: 0, spend: 0 };
    if (e.kind === "cig") calendar[key].cigs += e.quantity;
    else calendar[key].drinks += e.quantity;
    calendar[key].spend += e.unitCostInr * e.quantity;
  }

  const monthDates = datesFrom(monthStart, now);
  const smokeDays = Object.values(calendar).filter((v) => v.cigs > 0);
  const drinkDays = Object.values(calendar).filter((v) => v.drinks > 0);

  const spendByDay: DaySpend[] = datesFrom(now - 29 * 86400000, now).map((date) => ({
    date,
    cigs: calendar[date]?.cigs ?? 0,
    drinks: calendar[date]?.drinks ?? 0,
    spendCig: events
      .filter((e) => e.kind === "cig" && String(e.localDate) === date)
      .reduce((s, e) => s + e.unitCostInr * e.quantity, 0),
    spendDrink: events
      .filter((e) => e.kind === "drink" && String(e.localDate) === date)
      .reduce((s, e) => s + e.unitCostInr * e.quantity, 0),
  }));

  return {
    todayCigs: sumQty(todayCigs),
    todayDrinks: sumQty(todayDrinks),
    weekCigs: sumQty(weekCigs),
    weekDrinks: sumQty(weekDrinks),
    monthCigs: sumQty(monthCigs),
    monthDrinks: sumQty(monthDrinks),
    allCigs: sumQty(cigs),
    allDrinks: sumQty(drinks),
    spentTodayCig: sumCost(todayCigs),
    spentTodayDrink: sumCost(todayDrinks),
    spentMonthCig: sumCost(monthCigs),
    spentMonthDrink: sumCost(monthDrinks),
    spentAllCig: sumCost(cigs),
    spentAllDrink: sumCost(drinks),
    nicToday: todayCigs.reduce((s, e) => s + (e.nicotineMg ?? 0) * e.quantity, 0),
    tarToday: todayCigs.reduce((s, e) => s + (e.tarMg ?? 0) * e.quantity, 0),
    nicAll: cigs.reduce((s, e) => s + (e.nicotineMg ?? 0) * e.quantity, 0),
    tarAll: cigs.reduce((s, e) => s + (e.tarMg ?? 0) * e.quantity, 0),
    drinksTodayStd: todayDrinks.reduce((s, e) => s + (e.standardDrinks ?? 0) * e.quantity, 0),
    drinksAllStd: drinks.reduce((s, e) => s + (e.standardDrinks ?? 0) * e.quantity, 0),
    calToday: todayDrinks.reduce((s, e) => s + (e.calories ?? 0) * e.quantity, 0),
    calAll: drinks.reduce((s, e) => s + (e.calories ?? 0) * e.quantity, 0),
    lifeToday: sumQty(todayCigs) * LIFE_MIN_PER_CIG,
    lifeAll: sumQty(cigs) * LIFE_MIN_PER_CIG,
    gapToday: avgGapMins(todayCigs.map((e) => new Date(e.loggedAt).getTime())),
    gapWeek: avgGapMins(weekCigs.map((e) => new Date(e.loggedAt).getTime())),
    gapAll: avgGapMins(cigs.map((e) => new Date(e.loggedAt).getTime())),
    lastCigAt,
    lastDrinkAt,
    lastAt: events.length ? Math.max(...events.map((e) => new Date(e.loggedAt).getTime())) : null,
    smokeFreeStreak: consecutiveFreeDays(cigs, now),
    dryStreak: consecutiveFreeDays(drinks, now),
    smokeFreeThisMonth: monthDates.filter((d) => !(calendar[d]?.cigs)).length,
    dryThisMonth: monthDates.filter((d) => !(calendar[d]?.drinks)).length,
    heaviestWeekdayCig: heaviestWeekday(cigs),
    heaviestWeekdayDrink: heaviestWeekday(drinks),
    heaviestHourCig: heaviestHour(cigs),
    heaviestHourDrink: heaviestHour(drinks),
    topBrandCig: brands(cigs)[0] ?? null,
    topBrandDrink: brands(drinks)[0] ?? null,
    weekCountsCig: weekCountsFor(cigs, today0),
    weekCountsDrink: weekCountsFor(drinks, today0),
    hourGridCig: hourGridFor(cigs, now),
    hourGridDrink: hourGridFor(drinks, now),
    hourHistCig: hourHist(cigs),
    hourHistDrink: hourHist(drinks),
    weekdayHistCig: weekdayHist(cigs),
    weekdayHistDrink: weekdayHist(drinks),
    dayPartCig: parts(cigs),
    dayPartDrink: parts(drinks),
    brandCig: brands(cigs),
    brandDrink: brands(drinks),
    brandByWeekdayCig: brandWeekday(cigs),
    brandByWeekdayDrink: brandWeekday(drinks),
    spendByDay,
    calendar,
    smokingDays: smokeDays.length,
    drinkingDays: drinkDays.length,
    avgCigsOnSmokeDays: smokeDays.length ? smokeDays.reduce((s, d) => s + d.cigs, 0) / smokeDays.length : null,
    avgDrinksOnDrinkDays: drinkDays.length ? drinkDays.reduce((s, d) => s + d.drinks, 0) / drinkDays.length : null,
    skuCig: named(cigs, "productName"),
    skuDrink: named(drinks, "productName"),
    gapDrinkAll: avgGapMins(drinks.map((e) => new Date(e.loggedAt).getTime())),
    gapDrinkWeek: avgGapMins(weekDrinks.map((e) => new Date(e.loggedAt).getTime())),
    places: named(events, "city"),
    sourceCig: sources(cigs),
    sourceDrink: sources(drinks),
  };
}

function weekCountsFor(rows: EventRow[], today0: number): number[] {
  const counts = Array(7).fill(0);
  for (let i = 0; i < 7; i++) {
    const key = ymd(today0 - (6 - i) * 86400000);
    for (const e of rows) if (String(e.localDate) === key) counts[i] += e.quantity;
  }
  return counts;
}

function hourGridFor(rows: EventRow[], now: number): number[][] {
  const grid: number[][] = Array.from({ length: 6 }, () => Array(7).fill(0));
  const since = now - 28 * 86400000;
  for (const e of rows) {
    const t = new Date(e.loggedAt).getTime();
    if (t < since) continue;
    grid[Math.floor(e.hour / 4)][(e.weekday + 6) % 7] += e.quantity;
  }
  return grid;
}

function hourHist(rows: EventRow[]): number[] {
  const hits = Array(24).fill(0);
  for (const e of rows) hits[e.hour] += e.quantity;
  return hits;
}

function weekdayHist(rows: EventRow[]): number[] {
  const hits = Array(7).fill(0);
  for (const e of rows) hits[e.weekday] += e.quantity;
  return hits;
}

function parts(rows: EventRow[]): Record<string, number> {
  const out: Record<string, number> = { ...EMPTY_PARTS };
  for (const e of rows) {
    const key = e.dayPart ?? dayPart(e.hour);
    out[key] = (out[key] ?? 0) + e.quantity;
  }
  return out;
}

function brands(rows: EventRow[]): BrandStat[] {
  return named(rows, "brand");
}

function named(rows: EventRow[], key: "brand" | "productName" | "city"): BrandStat[] {
  const map = new Map<string, BrandStat>();
  for (const e of rows) {
    const label = (e[key] || "—") as string;
    const cur = map.get(label) ?? { name: label, count: 0, spend: 0 };
    cur.count += e.quantity;
    cur.spend += e.unitCostInr * e.quantity;
    map.set(label, cur);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function sources(rows: EventRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of rows) {
    const key = e.source || "tap";
    out[key] = (out[key] ?? 0) + e.quantity;
  }
  return out;
}

function brandWeekday(rows: EventRow[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const e of rows) {
    if (!out[e.brand]) out[e.brand] = Array(7).fill(0);
    out[e.brand][e.weekday] += e.quantity;
  }
  return out;
}

function heaviestWeekday(rows: EventRow[]): DayBrandStat | null {
  const hits = weekdayHist(rows);
  const maxW = Math.max(0, ...hits);
  return maxW > 0 ? { day: WEEKDAYS[hits.indexOf(maxW)], count: maxW } : null;
}

function heaviestHour(rows: EventRow[]): HourStat | null {
  const hits = hourHist(rows);
  const maxH = Math.max(0, ...hits);
  return maxH > 0 ? { hour: hits.indexOf(maxH), count: maxH } : null;
}

function datesFrom(from: number, to: number): string[] {
  const out: string[] = [];
  for (let t = startOfDay(from); t <= to; t += 86400000) out.push(ymd(t));
  return out;
}

function consecutiveFreeDays(rows: EventRow[], now: number): number {
  if (rows.length === 0) return 0;
  const days = new Set(rows.map((e) => String(e.localDate)));
  const first = Math.min(...rows.map((e) => new Date(e.loggedAt).getTime()));
  let streak = 0;
  let cursor = startOfDay(now);
  if (days.has(ymd(cursor))) return 0;
  cursor -= 86400000;
  while (cursor >= startOfDay(first)) {
    if (days.has(ymd(cursor))) break;
    streak++;
    cursor -= 86400000;
  }
  return streak;
}
