"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ChevronDown, Plus, Star } from "lucide-react";
import { AllIcon, GlassIcon, SmokeIcon } from "./Icons";
import { ProductShot } from "./ProductShot";
import { CATALOG, DEFAULT_DRINK_FAVORITES, DEFAULT_FAVORITES, displayCost, type Kind, type ProductDef } from "@/lib/catalog";
import { dashboard } from "@/lib/dashboard";
import { suggestedLoosePrice } from "@/lib/pricing";
import { avgGapMins, fmtINR, fmtMins, getZonedParts } from "@/lib/time";
import type { TrackerState } from "@/lib/social-types";
import "./mobile-home.css";
import { objectOrigin, type ObjectOrigin } from "@/lib/object-origin";

type MobileHomeProps = {
  data: TrackerState;
  now: number;
  onLog: (id: string, origin?: ObjectOrigin) => void;
  onOpenShelf: (kind: "cig" | "drink") => void;
  onEditFavorites: (kind: Kind) => void;
  onViewActivity: () => void;
  onSettings: () => void;
  pending?: boolean;
};

type Filter = "all" | Kind;

function since(iso: string | null, now: number) {
  if (!iso) return "—";
  const seconds = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ${String(seconds % 60).padStart(2, "0")}s` : fmtMins(minutes);
}

export default function MobileHome({ data, now, onLog, onOpenShelf, onEditFavorites, onViewActivity, onSettings, pending = false }: MobileHomeProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [clock, setClock] = useState(now);
  useEffect(() => { setClock(now); }, [now]);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const timezone = data.user?.timezone ?? "Asia/Kolkata";
  const stats = useMemo(() => dashboard(data.events, timezone, new Date(now)), [data.events, timezone, now]);
  const rows = useMemo(() => stats.sorted.map(event => ({ ...event, ...getZonedParts(new Date(event.loggedAt), timezone) })), [stats.sorted, timezone]);
  const visible = filter === "all" ? rows : rows.filter(event => event.kind === filter);
  const todayRows = visible.filter(event => event.localDate === stats.today);
  const lastCig = rows.find(event => event.kind === "cig")?.loggedAt ?? null;
  const lastDrink = rows.find(event => event.kind === "drink")?.loggedAt ?? null;
  const cigElapsed = since(lastCig, clock);
  const drinkElapsed = since(lastDrink, clock);
  const elapsed = filter === "drink" ? drinkElapsed : cigElapsed;
  const todayCount = filter === "drink" ? stats.todayDrinks : stats.todayCigs;
  const limit = data.user?.dailyLimit ?? 8;
  const spend = todayRows.reduce((total, event) => total + event.unitCostInr * event.quantity, 0);
  const gap = avgGapMins(todayRows.filter(event => filter !== "all" || event.kind === "cig").map(event => Date.parse(event.loggedAt)));
  const savedIds = data.user ? data.user.favoriteIds : [...DEFAULT_FAVORITES, ...DEFAULT_DRINK_FAVORITES];
  const favorites = savedIds
    .map(id => CATALOG.find(product => product.id === id))
    .filter((product): product is ProductDef => !!product && product.kind === "cig")
    .slice(0, 3);
  const drinkFavorites = savedIds.map(id => CATALOG.find(product => product.id === id))
    .filter((product): product is ProductDef => !!product && product.kind === "drink").slice(0, 3);
  const date = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: timezone }).format(new Date(now));
  const price = (product: ProductDef) => data.user?.priceOverrides[product.id] ?? (product.kind === "cig" ? suggestedLoosePrice(product.id, data.user?.defaultPrice ?? 25) : displayCost(product));

  function shelf(products: ProductDef[], kind: Kind) {
    return <section className="mh-shelf" aria-label={kind === "cig" ? "Cigarette quick log" : "Drink quick log"}>
      <div className="mh-products">
        {products.map(product => <button
          type="button"
          className="mh-product"
          data-product-id={product.id}
          key={product.id}
          onClick={event => onLog(product.id, objectOrigin(event.currentTarget))}
          disabled={pending}
          aria-label={`Log one ${product.name}, ${fmtINR(price(product))}`}
        >
          <span className="mh-product-art" aria-hidden="true"><ProductShot product={product} className="mh-product-shot" size="lg"/></span>
          <span className="mh-product-add" aria-hidden="true"><Plus size={17}/></span>
          <span className="mh-product-name">{product.name}</span>
          <span className="mh-product-price">{fmtINR(price(product))}</span>
        </button>)}
        {Array.from({length:3-products.length}, (_,index)=><button type="button" className="mh-product mh-add-favorite" key={`empty-${index}`} onClick={()=>onEditFavorites(kind)} aria-label={`Choose ${kind==="cig"?"cigarette":"drink"} favorite ${products.length+index+1}`}><span className="mh-more-shape" aria-hidden="true"><Plus size={20}/></span><span className="mh-product-name">Add favorite</span><span className="mh-product-price">Your shelf</span></button>)}
        <button type="button" className="mh-product mh-more" onClick={() => onOpenShelf(kind)} aria-label={`Open ${kind === "cig" ? "cigarette" : "drink"} shelf`}>
          <span className="mh-more-shape" aria-hidden="true"><Plus size={24}/></span>
          <span className="mh-product-name">More</span><span className="mh-product-price">All brands</span>
        </button>
      </div>
    </section>;
  }

  return <div className="mh-home">
    <div className="mh-date-row"><p>{date}</p><span>{data.user?.city || "Your daily tracker"}</span></div>
    <div className="mh-filter" role="group" aria-label="Filter your tracker"><span className="mh-filter-indicator" aria-hidden="true" style={{translate:`${filter === "all" ? 0 : filter === "cig" ? 100 : 200}% 0`}}/>
      {([{ id: "all", label: "All", Icon: AllIcon }, { id: "cig", label: "Smoke", Icon: SmokeIcon }, { id: "drink", label: "Drink", Icon: GlassIcon }] as const).map(({ id, label, Icon }) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={filter === id ? "mh-filter-selected" : ""}><Icon filled={filter === id}/>{label}</button>)}
    </div>

    <section className="mh-hero" aria-label="Time since last log and today's count">
      <h2>Since last</h2>
      {filter === "all" ? <div className="mh-combined">
        <div><span className="mh-hero-kind">cigarette</span><p className={`mh-since${cigElapsed.length > 7 ? " mh-since-long" : ""}`}>{cigElapsed}</p><p className="mh-hero-detail"><strong>{stats.todayCigs}</strong> / <button className="mh-goal" type="button" onClick={onSettings} aria-label={`Edit daily cigarette limit, currently ${limit}`}>{limit}</button> today</p></div>
        <div><span className="mh-hero-kind">drink</span><p className={`mh-since${drinkElapsed.length > 7 ? " mh-since-long" : ""}`}>{drinkElapsed}</p><p className="mh-hero-detail"><strong>{stats.todayDrinks}</strong> {stats.todayDrinks === 1 ? "serving" : "servings"} today</p></div>
      </div> : <div className="mh-single">
        <div><span className="mh-hero-kind">{filter === "cig" ? "cigarette" : "drink"}</span><p className={`mh-since${elapsed.length > 7 ? " mh-since-long" : ""}`}>{elapsed}</p><p className="mh-hero-detail">{(filter === "cig" ? lastCig : lastDrink) ? "since your last log" : "No logs yet"}</p></div>
        <div className="mh-today-count"><strong>{todayCount}</strong>{filter === "cig" ? <button className="mh-goal" type="button" onClick={onSettings} aria-label={`Edit daily cigarette limit, currently ${limit}`}>/ {limit}</button> : <span>today</span>}</div>
      </div>}
    </section>

    <div className="mh-favorites-heading"><h2>Your favorites</h2><button type="button" onClick={()=>onEditFavorites(filter==="drink"?"drink":"cig")}><Star size={13}/>Edit favorites</button></div>
    {filter !== "drink" && shelf(favorites, "cig")}
    {filter !== "cig" && shelf(drinkFavorites, "drink")}

    <div className="mh-stats">
      <section><h2>Spent today</h2><strong>{fmtINR(spend)}</strong><p>{filter === "all" ? "smoke + drink" : filter === "cig" ? "cigarettes" : "drinks"} · actual logged prices</p></section>
      <section><h2>{filter === "all" ? "Cigarette gap" : "Average gap"}</h2><strong>{gap === null ? "—" : fmtMins(gap)}</strong><p>{gap === null ? "available after 2 logs today" : "between today’s check-ins"}</p></section>
    </div>

    <section className="mh-today-summary" aria-label="Today's logged totals"><div><h2>Today</h2><strong>{filter === "all" ? stats.todayCigs + stats.todayDrinks : todayCount}<span> logged</span></strong></div><p>{filter === "all" ? `${stats.todayCigs} sticks · ${stats.todayDrinks} drinks` : `${todayCount} ${filter === "cig" ? "sticks" : "servings"}`}<span>{fmtINR(spend)} recorded</span></p></section>

    <details className="mh-week">
      <summary><span>Last 7 days</span><span className="mh-week-total">{filter === "drink" ? rows.filter(event => event.kind === "drink" && stats.days.some(day => day.date === event.localDate)).reduce((sum, event) => sum + event.quantity, 0) : stats.weekCount} {filter === "drink" ? "servings" : stats.weekCount === 1 ? "cigarette" : "cigarettes"}<ChevronDown size={15}/></span></summary>
      <div className="mh-week-days">{stats.days.map(day => {
        const cigarettes = day.count;
        const drinks = rows.filter(event => event.kind === "drink" && event.localDate === day.date).reduce((sum, event) => sum + event.quantity, 0);
        const count = filter === "drink" ? drinks : cigarettes;
        return <div className={`mh-week-day${day.date === stats.today ? " mh-week-today" : ""}`} key={day.date}><span>{day.date === stats.today ? "Today" : day.label}</span><strong>{count}</strong><span>{filter === "all" ? `${drinks} drink${drinks === 1 ? "" : "s"}` : filter === "drink" ? "servings" : "sticks"}</span></div>;
      })}</div>
      <p>No logs doesn’t mean a smoke-free or dry day.</p>
    </details>

    <section className="mh-recent" aria-labelledby="mh-recent-title">
      <div className="mh-recent-heading"><h2 id="mh-recent-title">Recent</h2><button type="button" onClick={onViewActivity}>All activity <ArrowUpRight size={15}/></button></div>
      {visible.length ? <ul>{visible.slice(0, 3).map(event => {
        const product = CATALOG.find(product => product.id === event.productId);
        return <li key={event.id}>{product && <span className="mh-recent-art" aria-hidden="true"><ProductShot product={product} size="sm"/></span>}<div><strong>{event.productName}</strong><span>{event.localDate === stats.today ? "Today" : new Intl.DateTimeFormat("en-IN", { month: "short", day: "numeric", timeZone: timezone }).format(new Date(event.loggedAt))} · {event.localTime} · {event.quantity} {event.kind === "cig" ? "stick" : "serving"}{event.quantity === 1 ? "" : "s"}</span></div><span className="mh-recent-price">{fmtINR(event.quantity * event.unitCostInr)}</span></li>;
      })}</ul> : <div className="mh-recent-empty"><p>Nothing logged yet.</p><span>Tap a cigarette or drink on your shelf to start.</span></div>}
    </section>
  </div>;
}
