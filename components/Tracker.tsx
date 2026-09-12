"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Burst } from "@/components/Burst";
import { HourHeatmap, WeekBars } from "@/components/Charts";
import { DataLab } from "@/components/DataLab";
import { AllIcon, CloseIcon, GearIcon, GlassIcon, PlusIcon, SmokeIcon, StarIcon } from "@/components/Icons";
import { ProductShot } from "@/components/ProductShot";
import { Pressable } from "@/components/Pressable";
import { logHit, undoHit, saveSettings } from "@/app/actions";
import type { ClientEvent, TrackerPayload } from "@/lib/types";
import { analyze } from "@/lib/analytics";
import {
  CATALOG,
  LIFE_MIN_PER_CIG,
  productById,
  servingLabel,
  displayCost,
  isSpiritPeg,
  type Kind,
  type ProductDef,
  type ViewKind,
} from "@/lib/catalog";
import { cn } from "@/lib/cn";
import type { EventRow } from "@/lib/schema";
import { fmtINR, fmtMins } from "@/lib/time";

function rowsOf(events: ClientEvent[]): EventRow[] {
  return events.map((e) => ({
    ...e,
    loggedAt: new Date(e.loggedAt),
    createdAt: new Date(e.createdAt),
  })) as EventRow[];
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function Tracker({ initial }: { initial: TrackerPayload }) {
  const [events, setEvents] = useState(initial.events);
  const [view, setView] = useState<ViewKind>("all");
  const [favorites, setFavorites] = useState(initial.favorites);
  const [drinkFavorites, setDrinkFavorites] = useState(initial.drinkFavorites);
  const [cigBaseline, setCigBaseline] = useState(initial.cigBaseline);
  const [drinkBaseline, setDrinkBaseline] = useState(initial.drinkBaseline);
  const [city, setCity] = useState(initial.city);
  const [picker, setPicker] = useState<Kind | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<{ id: string; name: string } | null>(null);
  const [burst, setBurst] = useState<{ product: ProductDef; nonce: number } | null>(null);
  const [, startTransition] = useTransition();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const now = useNow();

  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(null), 2400);
    return () => clearTimeout(t);
  }, [burst]);

  const stats = useMemo(() => analyze(rowsOf(events), now), [events, now]);
  const kind: Kind = view === "drink" ? "drink" : "cig";
  const shelfCig = favorites.map(productById).filter((p) => p.kind === "cig").slice(0, 3);
  const shelfDrink = drinkFavorites.map(productById).filter((p) => p.kind === "drink").slice(0, 3);
  const catalog = CATALOG.filter((p) => p.kind === (picker ?? kind));
  const sorted = useMemo(
    () => [...events].sort((a, b) => +new Date(b.loggedAt) - +new Date(a.loggedAt)),
    [events],
  );
  const visible = view === "all" ? sorted : sorted.filter((e) => e.kind === view);

  async function handleLog(id: string, source: "shelf" | "picker" | "bottle") {
    const product = productById(id);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setPicker(null);
    setBurst({ product, nonce: Date.now() });
    if (navigator.vibrate) navigator.vibrate(20);
    startTransition(async () => {
      try {
        const saved = await logHit({ productId: id, timezone: tz, source, city });
        setEvents((e) => [...e, saved]);
        setToast({ id: saved.id, name: saved.productName });
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 3200);
      } catch (err) {
        console.error(err);
      }
    });
  }

  async function handleUndo(id: string) {
    setEvents((e) => e.filter((x) => x.id !== id));
    setToast(null);
    await undoHit(id);
  }

  function toggleFav(id: string, favKind: Kind) {
    const setter = favKind === "cig" ? setFavorites : setDrinkFavorites;
    const current = favKind === "cig" ? favorites : drinkFavorites;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id].slice(-6);
    setter(next);
    startTransition(() =>
      saveSettings(favKind === "cig" ? { favoriteIds: next } : { drinkFavoriteIds: next }),
    );
  }

  const dateLabel = new Date(now).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });

  return (
    <main className="flex-1 w-full max-w-md mx-auto px-4 pb-16 pt-6 flex flex-col gap-3">
      <header className="stagger-item flex items-center justify-between px-1">
        <h1 className="text-[13px] font-semibold tracking-[0.22em] uppercase">Ashtray</h1>
        <Pressable
          onClick={() => setSettingsOpen((v) => !v)}
          className="size-10 rounded-full flex items-center justify-center text-ink-2"
          aria-label={settingsOpen ? "Close data" : "Open data"}
        >
          <span className="relative size-5 grid place-items-center">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={settingsOpen ? "close" : "gear"}
                initial={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
                transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                className="grid place-items-center"
              >
                {settingsOpen ? <CloseIcon className="size-5" /> : <GearIcon className="size-5" />}
              </motion.span>
            </AnimatePresence>
          </span>
        </Pressable>
      </header>

      <p className="stagger-item text-[13px] text-ink-3 capitalize tracking-[0.04em] px-1">{dateLabel}</p>

      <div className="stagger-item flex p-1 rounded-[20px] bg-paper">
        <KindTab active={view === "all"} onClick={() => setView("all")} icon="all" label="All" />
        <KindTab active={view === "cig"} onClick={() => setView("cig")} icon="cig" label="Smoke" />
        <KindTab active={view === "drink"} onClick={() => setView("drink")} icon="drink" label="Drink" />
      </div>

      {settingsOpen ? (
        <DataLab
          stats={stats}
          events={events}
          cigBaseline={cigBaseline}
          drinkBaseline={drinkBaseline}
          setCigBaseline={(n) => {
            setCigBaseline(n);
            startTransition(() => saveSettings({ cigBaseline: n }));
          }}
          setDrinkBaseline={(n) => {
            setDrinkBaseline(n);
            startTransition(() => saveSettings({ drinkBaseline: n }));
          }}
          city={city}
          setCity={(s) => {
            setCity(s);
            startTransition(() => saveSettings({ city: s }));
          }}
          favorites={favorites}
          drinkFavorites={drinkFavorites}
          toggleFav={toggleFav}
        />
      ) : (
        <>
          {view === "all" ? (
            <CombinedHero stats={stats} now={now} cigBaseline={cigBaseline} drinkBaseline={drinkBaseline} />
          ) : (
            <KindHero view={view} stats={stats} now={now} baseline={view === "cig" ? cigBaseline : drinkBaseline} />
          )}

          {(view === "all" || view === "cig") && (
            <Shelf
              products={shelfCig}
              onLog={(id) => handleLog(id, "shelf")}
              onMore={() => setPicker("cig")}
              caption="stick"
            />
          )}
          {(view === "all" || view === "drink") && (
            <Shelf
              products={shelfDrink}
              onLog={(id) => handleLog(id, "shelf")}
              onMore={() => setPicker("drink")}
              caption="serving"
            />
          )}

          {view === "all" && (
            <div className="stagger-item grid grid-cols-2 gap-3">
              <Stat label="₹ today" value={fmtINR(stats.spentTodayCig + stats.spentTodayDrink)} sub={`${fmtINR(stats.spentMonthCig + stats.spentMonthDrink)} this month`} />
              <Stat label="life / std" value={`${fmtMins(stats.lifeToday)} · ${stats.drinksTodayStd.toFixed(1)}`} sub={`${stats.nicToday.toFixed(1)}mg nic`} />
            </div>
          )}
          {view === "cig" && (
            <div className="stagger-item grid grid-cols-2 gap-3">
              <Stat label="₹ today" value={fmtINR(stats.spentTodayCig)} sub={`${fmtINR(stats.spentMonthCig)} this month`} />
              <Stat label="avg gap" value={stats.gapToday ? fmtMins(stats.gapToday) : "—"} sub={stats.gapWeek ? `${fmtMins(stats.gapWeek)} 7-day` : undefined} />
            </div>
          )}
          {view === "drink" && (
            <div className="stagger-item grid grid-cols-2 gap-3">
              <Stat label="₹ today" value={fmtINR(stats.spentTodayDrink)} sub={`${fmtINR(stats.spentMonthDrink)} this month`} />
              <Stat label="std drinks" value={stats.drinksTodayStd.toFixed(1)} sub={`${stats.calToday} kcal`} />
            </div>
          )}

          <section className="stagger-item card invert p-4">
            {view === "drink" ? (
              <Streak title="Dry streak" days={stats.dryStreak} note={`${stats.dryThisMonth} dry days this month`} />
            ) : view === "cig" ? (
              <Streak title="Smoke-free streak" days={stats.smokeFreeStreak} note={`${stats.smokeFreeThisMonth} smoke-free days this month`} />
            ) : (
              <Streak
                title="Today"
                days={stats.todayCigs + stats.todayDrinks}
                unit=""
                note={`${stats.todayCigs} sticks · ${stats.todayDrinks} drinks · ${fmtINR(stats.spentTodayCig + stats.spentTodayDrink)}`}
              />
            )}
          </section>

          <section className="stagger-item card p-4">
            <h2 className="text-[11px] uppercase tracking-[0.14em] text-ink-3 mb-3">Last 7 days</h2>
            <WeekBars
              cigs={view === "drink" ? stats.weekCountsDrink : stats.weekCountsCig}
              drinks={stats.weekCountsDrink}
              dual={view === "all"}
            />
            {view === "all" && (
              <p className="text-[10px] text-ink-3 mt-2">Rust = cigs · teal = drinks</p>
            )}
          </section>

          {view !== "all" && (
            <section className="stagger-item card p-4">
              <h2 className="text-[11px] uppercase tracking-[0.14em] text-ink-3 mb-3">
                {view === "cig" ? "When you smoke" : "When you drink"}
              </h2>
              <HourHeatmap grid={view === "cig" ? stats.hourGridCig : stats.hourGridDrink} />
            </section>
          )}

          <section className="stagger-item card p-4">
            <h2 className="text-[11px] uppercase tracking-[0.14em] text-ink-3 mb-3">Calendar</h2>
            <MonthCal calendar={stats.calendar} view={view} />
            <p className="text-xs text-ink-2 mt-3">
              {view === "drink"
                ? `Heaviest ${stats.heaviestWeekdayDrink?.day ?? "—"} · ${stats.heaviestWeekdayDrink?.count ?? 0} drinks · mostly ${stats.topBrandDrink?.name ?? "—"}`
                : view === "cig"
                  ? `Heaviest ${stats.heaviestWeekdayCig?.day ?? "—"} · ${stats.heaviestWeekdayCig?.count ?? 0} cigs · mostly ${stats.topBrandCig?.name ?? "—"}`
                  : `${stats.allCigs} sticks · ${stats.allDrinks} drinks · ${fmtINR(stats.spentAllCig + stats.spentAllDrink)}`}
            </p>
          </section>

          {view !== "all" && (
            <section className="stagger-item card p-4">
              <h2 className="text-[11px] uppercase tracking-[0.14em] text-ink-3 mb-3">
                {view === "cig" ? "Health ledger" : "Alcohol ledger"}
              </h2>
              <div className="grid grid-cols-3 gap-2 text-center">
                {view === "cig" ? (
                  <>
                    <Mini n={fmtMins(stats.lifeToday)} l="life · today" />
                    <Mini n={`${stats.nicToday.toFixed(1)}mg`} l="nicotine" />
                    <Mini n={`${stats.tarToday.toFixed(0)}mg`} l="tar" />
                  </>
                ) : (
                  <>
                    <Mini n={stats.todayDrinks.toString()} l="servings" />
                    <Mini n={stats.drinksTodayStd.toFixed(1)} l="std drinks" />
                    <Mini n={`${stats.calToday}`} l="kcal" />
                  </>
                )}
              </div>
              <p className="text-xs text-ink-2 mt-3">
                {view === "cig"
                  ? `All-time: ${stats.allCigs} sticks · ~${fmtMins(stats.lifeAll)} · ${fmtINR(stats.spentAllCig)}`
                  : `All-time: ${stats.allDrinks} drinks · ${stats.drinksAllStd.toFixed(1)} std · ${fmtINR(stats.spentAllDrink)}`}
              </p>
              {view === "cig" && (
                <p className="text-[10px] text-ink-3 mt-1">
                  ~{LIFE_MIN_PER_CIG} min/cig (UCL). Tar/nic are typical pack prints. Price is per stick.
                </p>
              )}
            </section>
          )}

          <section className="stagger-item card p-4">
            <h2 className="text-[11px] uppercase tracking-[0.14em] text-ink-3 mb-3">Recent</h2>
            {visible.length === 0 && <p className="text-sm text-ink-3">Nothing logged yet.</p>}
            <ul className="flex flex-col divide-y divide-line">
              {visible.slice(0, 14).map((e) => {
                const p = productById(e.productId);
                return (
                  <li key={e.id} className="flex items-center justify-between py-2.5 gap-3">
                    <span className="flex items-center gap-2 min-w-0">
                      <ProductShot product={p} size="sm" />
                      <span className="min-w-0">
                        <span className="block text-sm truncate">{e.productName}</span>
                        <span className="block text-[11px] text-ink-3 font-mono tracking-[0.01em]">
                          {e.localTime} · {e.localDate} · {fmtINR(e.unitCostInr)}
                          {e.kind === "cig" ? ` · ${e.nicotineMg ?? "—"}mg` : ` · ${e.standardDrinks ?? "—"} std`}
                        </span>
                      </span>
                    </span>
                    <Pressable onClick={() => handleUndo(e.id)} className="text-ink-3 text-xs px-2 py-2" aria-label={`Remove ${e.productName}`} static>
                      ✕
                    </Pressable>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      <AnimatePresence>
        {picker && (
          <Picker
            catalog={catalog}
            onPick={(id, source = "picker") => handleLog(id, source)}
            onClose={() => setPicker(null)}
            favs={picker === "cig" ? favorites : drinkFavorites}
            toggleFav={(id) => toggleFav(id, picker)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-md card px-4 py-2.5 flex items-center gap-3"
          >
            <span className="text-sm text-ink-2">
              Logged <span className="text-ink">{toast.name}</span>
            </span>
            <Pressable static onClick={() => handleUndo(toast.id)} className="text-sm text-rust font-medium tracking-[0.02em]">
              undo
            </Pressable>
          </motion.div>
        )}
      </AnimatePresence>

      <Burst product={burst?.product ?? null} nonce={burst?.nonce ?? 0} />
    </main>
  );
}

function CombinedHero({
  stats,
  now,
  cigBaseline,
  drinkBaseline,
}: {
  stats: ReturnType<typeof analyze>;
  now: number;
  cigBaseline: number;
  drinkBaseline: number;
}) {
  const cigSince = stats.lastCigAt ? (now - stats.lastCigAt) / 60000 : null;
  const drinkSince = stats.lastDrinkAt ? (now - stats.lastDrinkAt) / 60000 : null;
  return (
    <section className="stagger-item card p-5">
      <p className="text-[11px] uppercase tracking-[0.14em] text-ink-3">Since last</p>
      <div className="mt-2 grid grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] text-ink-3">cig</p>
          <p className="text-[40px] leading-[0.9] font-semibold tracking-[-0.05em] tabular">
            {cigSince == null ? "—" : fmtMins(cigSince)}
          </p>
          <p className="text-xs text-ink-2 mt-2 tabular">
            {stats.todayCigs}/{cigBaseline} today
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-ink-3">drink</p>
          <p className="text-[40px] leading-[0.9] font-semibold tracking-[-0.05em] tabular">
            {drinkSince == null ? "—" : fmtMins(drinkSince)}
          </p>
          <p className="text-xs text-ink-2 mt-2 tabular">
            {stats.todayDrinks}/{drinkBaseline} today
          </p>
        </div>
      </div>
    </section>
  );
}

function KindHero({
  view,
  stats,
  now,
  baseline,
}: {
  view: Kind;
  stats: ReturnType<typeof analyze>;
  now: number;
  baseline: number;
}) {
  const lastAt = view === "cig" ? stats.lastCigAt : stats.lastDrinkAt;
  const todayCount = view === "cig" ? stats.todayCigs : stats.todayDrinks;
  const since = lastAt ? (now - lastAt) / 60000 : null;
  const over = todayCount - baseline;
  return (
    <section className="stagger-item card p-5">
      <p className="text-[11px] uppercase tracking-[0.14em] text-ink-3">
        Since last {view === "cig" ? "cig" : "drink"}
      </p>
      <div className="mt-2 flex items-end justify-between gap-4">
        <p className="text-[52px] leading-[0.9] font-semibold tracking-[-0.05em] tabular">
          {since === null ? "—" : fmtMins(since)}
        </p>
        <div className="text-right pb-1">
          <p className="text-[11px] uppercase tracking-[0.14em] text-ink-3">Today</p>
          <p className="text-[28px] font-semibold tracking-[-0.03em] tabular">
            {todayCount}
            <span className="text-base text-ink-3">/{baseline}</span>
          </p>
        </div>
      </div>
      <div className="mt-4 h-1.5 rounded-full bg-paper overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, (todayCount / Math.max(1, baseline)) * 100)}%`,
            backgroundColor: over > 0 ? "var(--rust)" : "var(--ink)",
            transitionProperty: "width, background-color",
            transitionDuration: "150ms",
            transitionTimingFunction: "ease-out",
          }}
        />
      </div>
      <p className="text-xs mt-2 text-ink-2">
        {over > 0 ? <span className="text-rust">{over} over baseline</span> : <span>{Math.abs(over)} under baseline</span>}
      </p>
    </section>
  );
}

function Shelf({
  products,
  onLog,
  onMore,
  caption,
}: {
  products: ProductDef[];
  onLog: (id: string) => void;
  onMore: () => void;
  caption: string;
}) {
  return (
    <div className="stagger-item grid grid-cols-4 gap-2">
      {products.map((p) => (
        <Pressable
          key={p.id}
          onClick={() => onLog(p.id)}
          className="card p-2 pt-3 flex flex-col items-center gap-1.5"
          aria-label={`Log ${p.name}`}
        >
          <ProductShot product={p} />
          <span className="text-[10px] leading-tight text-center text-ink-2 line-clamp-2 tracking-[0.01em]">{p.name}</span>
          <span className="text-[10px] text-ink-3 tabular">{fmtINR(displayCost(p))}</span>
        </Pressable>
      ))}
      <Pressable onClick={onMore} className="card p-2 flex flex-col items-center justify-center gap-1" aria-label={`Open ${caption} shelf`}>
        <PlusIcon className="size-7 text-ink" />
        <span className="text-[10px] text-ink-3 tracking-[0.02em]">more</span>
      </Pressable>
    </div>
  );
}

function Streak({ title, days, note, unit = " days" }: { title: string; days: number; note: string; unit?: string }) {
  return (
    <div className="flex items-end justify-between">
      <div>
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/50">{title}</p>
        <p className="text-[40px] font-semibold tracking-[-0.04em] tabular mt-1">
          {days}
          <span className="text-base font-medium text-white/50">{unit}</span>
        </p>
      </div>
      <p className="text-xs text-white/55 text-right max-w-[9rem]">{note}</p>
    </div>
  );
}

function KindTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ViewKind;
  label: string;
}) {
  return (
    <Pressable
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex-1 h-10 rounded-[16px] text-sm font-medium tracking-[0.02em] flex items-center justify-center gap-1.5",
        active ? "bg-canvas text-ink shadow-[var(--shadow-border)]" : "text-ink-3",
      )}
    >
      <span className="relative size-4 grid place-items-center">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={active ? "fill" : "line"}
            initial={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
            transition={{ type: "spring", duration: 0.3, bounce: 0 }}
            className="grid place-items-center"
          >
            {icon === "all" ? (
              <AllIcon filled={active} className="size-4" />
            ) : icon === "cig" ? (
              <SmokeIcon filled={active} className="size-4" />
            ) : (
              <GlassIcon filled={active} className="size-4" />
            )}
          </motion.span>
        </AnimatePresence>
      </span>
      {label}
    </Pressable>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-3.5">
      <p className="text-[11px] uppercase tracking-[0.12em] text-ink-3">{label}</p>
      <p className="text-xl font-semibold mt-1 tabular tracking-[-0.02em]">{value}</p>
      {sub && <p className="text-xs text-ink-2 mt-0.5">{sub}</p>}
    </div>
  );
}

function Mini({ n, l }: { n: string; l: string }) {
  return (
    <div>
      <p className="text-lg font-semibold tabular tracking-[-0.02em]">{n}</p>
      <p className="text-[10px] text-ink-3 uppercase tracking-[0.08em] mt-0.5">{l}</p>
    </div>
  );
}

function MonthCal({
  calendar,
  view,
}: {
  calendar: Record<string, { cigs: number; drinks: number }>;
  view: ViewKind;
}) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(y, m, 1);
  const startPad = (first.getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(startPad).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const max = Math.max(
    1,
    ...Object.values(calendar).map((v) =>
      view === "cig" ? v.cigs : view === "drink" ? v.drinks : v.cigs + v.drinks,
    ),
  );

  return (
    <div className="grid grid-cols-7 gap-1">
      {["m", "t", "w", "t", "f", "s", "s"].map((d, i) => (
        <div key={i} className="text-center text-[10px] text-ink-3 tracking-[0.06em] pb-1">
          {d}
        </div>
      ))}
      {cells.map((day, i) => {
        if (!day) return <div key={`e${i}`} />;
        const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const cell = calendar[key];
        const n = view === "cig" ? cell?.cigs ?? 0 : view === "drink" ? cell?.drinks ?? 0 : (cell?.cigs ?? 0) + (cell?.drinks ?? 0);
        const isToday = day === now.getDate();
        const mix = view === "all" && (cell?.cigs ?? 0) > 0 && (cell?.drinks ?? 0) > 0;
        return (
          <div
            key={day}
            className={cn("h-8 rounded-[8px] flex items-center justify-center text-[11px] tabular", isToday && "outline outline-1 outline-ink")}
            style={{
              backgroundColor:
                n === 0
                  ? "transparent"
                  : mix
                    ? "color-mix(in oklab, var(--rust) 55%, #1f4b5a)"
                    : `color-mix(in oklab, var(--rust) ${Math.round(18 + 70 * (n / max))}%, white)`,
            }}
            title={`${cell?.cigs ?? 0} cigs · ${cell?.drinks ?? 0} drinks`}
          >
            {day}
          </div>
        );
      })}
    </div>
  );
}

function Picker({
  catalog,
  onPick,
  onClose,
  favs,
  toggleFav,
}: {
  catalog: ProductDef[];
  onPick: (id: string, source?: "picker" | "bottle") => void;
  onClose: () => void;
  favs: string[];
  toggleFav: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const list = catalog.filter(
    (p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.brand.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <motion.div
      className="fixed inset-0 z-40 flex justify-center bg-ink/30"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-md max-h-[86vh] overflow-y-auto rounded-t-[28px] bg-canvas p-4 pb-10"
        initial={{ y: 24 }}
        animate={{ y: 0 }}
        exit={{ y: 12 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold tracking-[0.08em] uppercase">Shelf</h2>
          <Pressable onClick={onClose} className="size-10 rounded-full flex items-center justify-center" aria-label="Close shelf">
            <CloseIcon className="size-5" />
          </Pressable>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search brand"
          className="w-full h-11 rounded-[12px] bg-paper px-3 text-sm mb-3 outline-none"
        />
        <p className="text-[11px] text-ink-3 mb-2">Spirits log a 30ml peg. Use bottle if you bought the 750.</p>
        <ul className="flex flex-col">
          {list.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-2.5 border-b border-line">
              <Pressable onClick={() => onPick(p.id, "picker")} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                <ProductShot product={p} size="sm" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium truncate">{p.name}</span>
                  <span className="block text-[11px] text-ink-3 truncate">{servingLabel(p)}</span>
                </span>
              </Pressable>
              {isSpiritPeg(p) && (
                <Pressable
                  onClick={() => onPick(p.id, "bottle")}
                  className="px-2 py-2 rounded-[12px] bg-paper text-[10px] text-ink-2 shrink-0"
                  aria-label={`Log bought ${p.name} bottle`}
                >
                  bottle
                  <span className="block tabular">{fmtINR(p.packPrice)}</span>
                </Pressable>
              )}
              <Pressable
                onClick={() => toggleFav(p.id)}
                className="size-10 flex items-center justify-center text-ink-3 aria-pressed:text-ink"
                aria-label={favs.includes(p.id) ? "Unstar" : "Star as frequent"}
                aria-pressed={favs.includes(p.id)}
              >
                <StarIcon filled={favs.includes(p.id)} className="size-4" />
              </Pressable>
            </li>
          ))}
        </ul>
      </motion.div>
    </motion.div>
  );
}
