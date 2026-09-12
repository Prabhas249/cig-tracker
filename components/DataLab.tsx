"use client";

import { HourBars, HourHeatmap, RankBars, SpendLine, WeekdayDots } from "@/components/Charts";
import { ProductShot } from "@/components/ProductShot";
import { Pressable } from "@/components/Pressable";
import { StarIcon } from "@/components/Icons";
import type { Analytics } from "@/lib/analytics";
import { CATALOG, PRICE_REGION, servingLabel, type Kind } from "@/lib/catalog";
import type { ClientEvent } from "@/lib/types";
import { fmtINR, fmtMins, WEEKDAYS } from "@/lib/time";

export function DataLab({
  stats,
  events,
  cigBaseline,
  drinkBaseline,
  setCigBaseline,
  setDrinkBaseline,
  city,
  setCity,
  favorites,
  drinkFavorites,
  toggleFav,
}: {
  stats: Analytics;
  events: ClientEvent[];
  cigBaseline: number;
  drinkBaseline: number;
  setCigBaseline: (n: number) => void;
  setDrinkBaseline: (n: number) => void;
  city: string;
  setCity: (s: string) => void;
  favorites: string[];
  drinkFavorites: string[];
  toggleFav: (id: string, kind: Kind) => void;
}) {
  const sorted = [...events].sort((a, b) => +new Date(b.loggedAt) - +new Date(a.loggedAt));
  const totalSpend = stats.spentAllCig + stats.spentAllDrink;

  return (
    <div className="flex flex-col gap-3">
      <section className="card p-4">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-ink-3 mb-3">Baselines</h2>
        <label className="flex items-center justify-between text-sm mb-3">
          <span className="text-ink-2">Daily cig baseline</span>
          <input
            type="number"
            min={1}
            value={cigBaseline}
            onChange={(e) => setCigBaseline(Math.max(1, Number(e.target.value) || 1))}
            className="w-16 bg-paper rounded-[12px] px-2 py-1 text-right font-mono"
          />
        </label>
        <label className="flex items-center justify-between text-sm mb-3">
          <span className="text-ink-2">Daily drink baseline</span>
          <input
            type="number"
            min={1}
            value={drinkBaseline}
            onChange={(e) => setDrinkBaseline(Math.max(1, Number(e.target.value) || 1))}
            className="w-16 bg-paper rounded-[12px] px-2 py-1 text-right font-mono"
          />
        </label>
        <label className="flex items-center justify-between text-sm">
          <span className="text-ink-2">City</span>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Bengaluru"
            className="w-36 bg-paper rounded-[12px] px-2 py-1 text-right text-sm"
          />
        </label>
        <p className="text-[10px] text-ink-3 mt-3">{PRICE_REGION}. One stick or one serving per tap.</p>
      </section>

      <section className="card invert p-4">
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/50">All-time spend</p>
        <p className="text-[40px] font-semibold tracking-[-0.04em] tabular mt-1">{fmtINR(totalSpend)}</p>
        <p className="text-xs text-white/55 mt-1">
          {fmtINR(stats.spentAllCig)} cigs · {fmtINR(stats.spentAllDrink)} drinks
        </p>
      </section>

      <section className="card p-4">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-ink-3 mb-1">Spend · 30 days</h2>
        <SpendLine days={stats.spendByDay} />
        <p className="text-xs text-ink-2">
          Rust cigs · teal drinks · this month {fmtINR(stats.spentMonthCig + stats.spentMonthDrink)} · today{" "}
          {fmtINR(stats.spentTodayCig + stats.spentTodayDrink)}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <MiniStat label="Smoke days" value={String(stats.smokingDays)} sub={stats.avgCigsOnSmokeDays ? `${stats.avgCigsOnSmokeDays.toFixed(1)} / smoke day` : "—"} />
        <MiniStat label="Drink days" value={String(stats.drinkingDays)} sub={stats.avgDrinksOnDrinkDays ? `${stats.avgDrinksOnDrinkDays.toFixed(1)} / drink day` : "—"} />
        <MiniStat label="Cig gap" value={stats.gapAll ? fmtMins(stats.gapAll) : "—"} sub={stats.gapWeek ? `${fmtMins(stats.gapWeek)} this week` : "need 2+ logs"} />
        <MiniStat label="Drink gap" value={stats.gapDrinkAll ? fmtMins(stats.gapDrinkAll) : "—"} sub={stats.gapDrinkWeek ? `${fmtMins(stats.gapDrinkWeek)} this week` : "need 2+ logs"} />
        <MiniStat label="Nicotine" value={`${stats.nicAll.toFixed(1)}mg`} sub={`${stats.tarAll.toFixed(0)}mg tar`} />
        <MiniStat label="Alcohol" value={`${stats.drinksAllStd.toFixed(1)} std`} sub={`${stats.calAll} kcal`} />
        <MiniStat label="Smoke-free" value={`${stats.smokeFreeThisMonth}`} sub="days this month" />
        <MiniStat label="Dry days" value={`${stats.dryThisMonth}`} sub="this month" />
      </div>

      <section className="card p-4">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-ink-3 mb-3">When you smoke</h2>
        <HourBars counts={stats.hourHistCig} accent="var(--rust)" />
        <p className="text-[10px] text-ink-3 mt-2 tracking-[0.04em]">00 — 23h</p>
        <div className="mt-3">
          <WeekdayDots counts={stats.weekdayHistCig} />
        </div>
        <div className="mt-4">
          <HourHeatmap grid={stats.hourGridCig} />
        </div>
        <p className="text-xs text-ink-2 mt-3">
          Peak {peak(stats.heaviestHourCig?.hour)} · heaviest {stats.heaviestWeekdayCig?.day ?? "—"} ·{" "}
          {partLine(stats.dayPartCig)}
        </p>
      </section>

      <section className="card p-4">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-ink-3 mb-3">When you drink</h2>
        <HourBars counts={stats.hourHistDrink} accent="#1f4b5a" />
        <p className="text-[10px] text-ink-3 mt-2 tracking-[0.04em]">00 — 23h</p>
        <div className="mt-3">
          <WeekdayDots counts={stats.weekdayHistDrink} />
        </div>
        <div className="mt-4">
          <HourHeatmap grid={stats.hourGridDrink} />
        </div>
        <p className="text-xs text-ink-2 mt-3">
          Peak {peak(stats.heaviestHourDrink?.hour)} · heaviest {stats.heaviestWeekdayDrink?.day ?? "—"} ·{" "}
          {partLine(stats.dayPartDrink)}
        </p>
      </section>

      <section className="card p-4">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-ink-3 mb-3">Where</h2>
        <RankBars rows={stats.places} value="count" />
        <p className="text-xs text-ink-2 mt-3">Spend by place</p>
        <RankBars rows={stats.places} value="spend" />
        <p className="text-[10px] text-ink-3 mt-3">
          Cigs from {stats.sourceCig.shelf ?? 0} shelf · {stats.sourceCig.picker ?? 0} picker · drinks{" "}
          {stats.sourceDrink.shelf ?? 0} shelf · {stats.sourceDrink.picker ?? 0} picker
        </p>
      </section>

      <section className="card p-4">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-ink-3 mb-3">Brands you smoke</h2>
        <RankBars rows={stats.brandCig} value="count" />
        <p className="text-xs text-ink-2 mt-3">Spend</p>
        <RankBars rows={stats.brandCig} value="spend" />
        <p className="text-xs text-ink-2 mt-3">By stick</p>
        <RankBars rows={stats.skuCig} value="count" />
        <BrandDays matrix={stats.brandByWeekdayCig} />
      </section>

      <section className="card p-4">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-ink-3 mb-3">What you drink</h2>
        <RankBars rows={stats.brandDrink} value="count" />
        <p className="text-xs text-ink-2 mt-3">Spend</p>
        <RankBars rows={stats.brandDrink} value="spend" />
        <p className="text-xs text-ink-2 mt-3">By serving</p>
        <RankBars rows={stats.skuDrink} value="count" />
        <BrandDays matrix={stats.brandByWeekdayDrink} />
      </section>

      <FavBlock kind="cig" title="Star cigs you smoke most" favs={favorites} toggleFav={toggleFav} />
      <FavBlock kind="drink" title="Star drinks you have most" favs={drinkFavorites} toggleFav={toggleFav} />

      <section className="card p-4">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-ink-3 mb-3">Every log</h2>
        <ul className="flex flex-col divide-y divide-line max-h-80 overflow-y-auto">
          {sorted.map((e) => (
            <li key={e.id} className="py-2.5 text-xs">
              <p className="text-sm text-ink truncate">{e.productName}</p>
              <p className="text-ink-3 font-mono tracking-[0.01em] mt-0.5">
                {e.localDate} {e.localTime} · {WEEKDAYS[e.weekday]} · {e.dayPart ?? ""} · {e.city ?? e.timezone}
              </p>
              <p className="text-ink-2 mt-0.5">
                {fmtINR(e.unitCostInr * e.quantity)}
                {e.kind === "cig"
                  ? ` · ${e.nicotineMg ?? "—"}mg nic · ${e.tarMg ?? "—"}mg tar · ${e.strength ?? ""} · ${e.lengthMm ?? "—"}mm`
                  : ` · ${e.standardDrinks ?? "—"} std · ${e.volumeMl ?? "—"}ml · ${e.abv ?? "—"}% · ${e.calories ?? "—"} kcal`}
                {` · ${e.source}`}
              </p>
            </li>
          ))}
          {sorted.length === 0 && <p className="text-sm text-ink-3">Nothing logged yet.</p>}
        </ul>
      </section>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-3.5">
      <p className="text-[11px] uppercase tracking-[0.12em] text-ink-3">{label}</p>
      <p className="text-xl font-semibold mt-1 tabular tracking-[-0.02em]">{value}</p>
      <p className="text-xs text-ink-2 mt-0.5">{sub}</p>
    </div>
  );
}

function BrandDays({ matrix }: { matrix: Record<string, number[]> }) {
  const brands = Object.keys(matrix);
  if (!brands.length) return null;
  return (
    <div className="mt-4">
      <p className="text-[11px] uppercase tracking-[0.12em] text-ink-3 mb-2">Brand × weekday</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] tabular">
          <thead>
            <tr className="text-ink-3">
              <th className="text-left font-medium pb-1 pr-2"> </th>
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <th key={i} className="font-medium pb-1">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {brands.slice(0, 8).map((b) => (
              <tr key={b}>
                <td className="pr-2 py-0.5 truncate max-w-[5.5rem] text-ink-2">{b}</td>
                {matrix[b].map((n, i) => (
                  <td key={i} className="text-center py-0.5">{n || "·"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FavBlock({
  kind,
  title,
  favs,
  toggleFav,
}: {
  kind: Kind;
  title: string;
  favs: string[];
  toggleFav: (id: string, kind: Kind) => void;
}) {
  const catalog = CATALOG.filter((p) => p.kind === kind);
  return (
    <section className="card p-4">
      <h2 className="text-[11px] uppercase tracking-[0.14em] text-ink-3 mb-3">{title}</h2>
      <ul className="flex flex-col max-h-56 overflow-y-auto">
        {catalog.map((p) => (
          <li key={p.id} className="flex items-center gap-2 py-2 border-b border-line">
            <ProductShot product={p} size="sm" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm truncate">{p.name}</span>
              <span className="block text-[11px] text-ink-3 truncate">{servingLabel(p)}</span>
            </span>
            <Pressable
              onClick={() => toggleFav(p.id, kind)}
              className="size-10 flex items-center justify-center"
              aria-pressed={favs.includes(p.id)}
              aria-label={`Favorite ${p.name}`}
            >
              <StarIcon filled={favs.includes(p.id)} className={favs.includes(p.id) ? "size-4 text-ink" : "size-4 text-ink-3"} />
            </Pressable>
          </li>
        ))}
      </ul>
    </section>
  );
}

function peak(h?: number) {
  if (h == null) return "—";
  const am = h < 12;
  return `${h % 12 || 12}${am ? "am" : "pm"}`;
}

function partLine(parts: Record<string, number>) {
  const order = ["morning", "afternoon", "evening", "late", "night"] as const;
  const top = [...order].sort((a, b) => (parts[b] ?? 0) - (parts[a] ?? 0))[0];
  return parts[top] ? `mostly ${top}` : "no pattern yet";
}
