"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { fmtINR } from "@/lib/time";

export function WeekBars({
  cigs,
  drinks,
  dual = false,
}: {
  cigs: number[];
  drinks?: number[];
  dual?: boolean;
}) {
  const max = Math.max(1, ...cigs, ...(drinks ?? []));
  return (
    <div className="flex items-end justify-between gap-2 h-24 px-1">
      {cigs.map((n, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const isToday = i === 6;
        const label = ["s", "m", "t", "w", "t", "f", "s"][d.getDay()];
        const drinkN = drinks?.[i] ?? 0;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-2">
            <div className="w-full h-[72px] flex items-end justify-center gap-0.5">
              <div
                className="flex-1 rounded-full"
                style={{
                  height: `${Math.max(8, (n / max) * 72)}px`,
                  backgroundColor: isToday ? "var(--rust)" : n ? "var(--ink)" : "var(--paper)",
                  transitionProperty: "height, background-color",
                  transitionDuration: "150ms",
                  transitionTimingFunction: "ease-out",
                }}
              />
              {dual && (
                <div
                  className="flex-1 rounded-full"
                  style={{
                    height: `${Math.max(8, (drinkN / max) * 72)}px`,
                    backgroundColor: drinkN ? "#1f4b5a" : "var(--paper)",
                    transitionProperty: "height, background-color",
                    transitionDuration: "150ms",
                    transitionTimingFunction: "ease-out",
                  }}
                />
              )}
            </div>
            <span className={cn("text-[11px] tracking-[0.04em]", isToday ? "text-rust" : "text-ink-3")}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function HourBars({ counts, accent = "var(--ink)" }: { counts: number[]; accent?: string }) {
  const max = Math.max(1, ...counts);
  return (
    <div className="flex items-end gap-px h-16">
      {counts.map((n, h) => (
        <div
          key={h}
          title={`${h}:00 · ${n}`}
          className="flex-1 rounded-t-[3px]"
          style={{
            height: `${Math.max(2, (n / max) * 64)}px`,
            backgroundColor: n ? accent : "var(--paper)",
            transitionProperty: "height",
            transitionDuration: "150ms",
            transitionTimingFunction: "ease-out",
          }}
        />
      ))}
    </div>
  );
}

export function SpendLine({ days }: { days: { date: string; spendCig: number; spendDrink: number }[] }) {
  const cigs = days.map((d) => d.spendCig);
  const drinks = days.map((d) => d.spendDrink);
  const totals = days.map((d) => d.spendCig + d.spendDrink);
  const max = Math.max(1, ...totals);
  const w = 280;
  const h = 72;
  const line = (vals: number[]) =>
    vals
      .map((n, i) => {
        const x = (i / Math.max(1, vals.length - 1)) * w;
        const y = h - (n / max) * (h - 8) - 4;
        return `${x},${y}`;
      })
      .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20" aria-hidden>
      <polyline fill="none" stroke="var(--rust)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={line(cigs)} />
      <polyline fill="none" stroke="#1f4b5a" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={line(drinks)} />
    </svg>
  );
}

export function RankBars({
  rows,
  value,
}: {
  rows: { name: string; count: number; spend: number }[];
  value: "count" | "spend";
}) {
  const max = Math.max(1, ...rows.map((r) => (value === "count" ? r.count : r.spend)));
  return (
    <ul className="flex flex-col gap-2">
      {rows.slice(0, 8).map((r) => {
        const n = value === "count" ? r.count : r.spend;
        return (
          <li key={r.name}>
            <div className="flex justify-between text-xs mb-1">
              <span className="truncate pr-2">{r.name}</span>
              <span className="tabular text-ink-2">{value === "count" ? n : fmtINR(n)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-paper overflow-hidden">
              <div
                className="h-full rounded-full bg-ink"
                style={{
                  width: `${(n / max) * 100}%`,
                  transitionProperty: "width",
                  transitionDuration: "150ms",
                  transitionTimingFunction: "ease-out",
                }}
              />
            </div>
          </li>
        );
      })}
      {rows.length === 0 && <p className="text-sm text-ink-3">Nothing yet.</p>}
    </ul>
  );
}

export function WeekdayDots({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  const labels = ["S", "M", "T", "W", "T", "F", "S"];
  return (
    <div className="grid grid-cols-7 gap-1">
      {counts.map((n, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <div
            className="size-8 rounded-[8px] flex items-center justify-center text-[11px] tabular"
            style={{
              backgroundColor: n === 0 ? "var(--paper)" : `color-mix(in oklab, var(--rust) ${Math.round(20 + 80 * (n / max))}%, white)`,
            }}
          >
            {n || ""}
          </div>
          <span className="text-[10px] text-ink-3 tracking-[0.06em]">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

const BUCKETS = ["12–4a", "4–8a", "8–12p", "12–4p", "4–8p", "8–12a"];
const HEAT_DAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function HourHeatmap({ grid }: { grid: number[][] }) {
  const [sel, setSel] = useState<{ d: number; b: number } | null>(null);
  const max = Math.max(1, ...grid.flat());
  return (
    <div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: "3.2rem repeat(7, 1fr)" }}>
        <div />
        {HEAT_DAYS.map((d, i) => (
          <div key={i} className="text-center text-[10px] text-ink-3 pb-1 tracking-[0.04em]">
            {d}
          </div>
        ))}
        {grid.map((row, b) => (
          <div key={b} className="contents">
            <div className="text-[10px] text-ink-3 pr-2 flex items-center justify-end font-mono">{BUCKETS[b]}</div>
            {row.map((count, d) => {
              const active = sel?.d === d && sel?.b === b;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSel(active ? null : { d, b })}
                  aria-label={`${HEAT_DAYS[d]} ${BUCKETS[b]}: ${count}`}
                  className={cn("h-7 rounded-[6px] pressable", active && "outline outline-1 outline-ink")}
                  style={{
                    backgroundColor:
                      count === 0 ? "var(--paper)" : `color-mix(in oklab, var(--rust) ${Math.round(22 + 78 * (count / max))}%, white)`,
                    transitionProperty: "background-color, scale",
                    transitionDuration: "150ms",
                    transitionTimingFunction: "ease-out",
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-2 h-4">
        {sel ? `${BUCKETS[sel.b]} · ${grid[sel.b][sel.d]} in last 4 weeks` : "Last 4 weeks · tap a cell"}
      </p>
    </div>
  );
}
