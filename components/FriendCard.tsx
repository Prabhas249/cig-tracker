"use client";

import { Check, ChevronDown, Cigarette, Lock, UserRound, X } from "lucide-react";
import { CATALOG } from "@/lib/catalog";
import { timeSince } from "@/lib/dashboard";
import { fmtINR, getZonedParts } from "@/lib/time";
import type { FriendActivityEntry, FriendSummary } from "@/lib/social-types";
import { ProductShot } from "./ProductShot";
import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import { AnimatedValue } from "./MotionUI";
import "./friend-card.css";

type FriendCardProps = {
  friend: FriendSummary;
  now: number;
  pending: boolean;
  onRemove: (id: string) => void;
};

function calendarLabel(date: string) {
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat("en-IN", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  }).format(parsed);
}

function logTime(log: FriendActivityEntry, timezone: string) {
  try {
    const date = new Date(log.loggedAt);
    const clock = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(date);
    const zone = new Intl.DateTimeFormat("en-IN", {
      timeZone: timezone, timeZoneName: "short",
    }).formatToParts(date).find(part => part.type === "timeZoneName")?.value ?? timezone;
    return { clock, zone };
  } catch {
    return { clock: /^\d{2}:\d{2}$/.test(log.localTime) ? log.localTime : "—", zone: timezone };
  }
}

export default function FriendCard({ friend, now, pending, onRemove }: FriendCardProps) {
  const reduce = useReducedMotionConfig();
  const activity = friend.activity;
  const sharing = friend.sharing;
  const stats = sharing === "private" ? null : friend.stats;
  const showActivity = sharing === "activity" && activity !== null;
  const logs = showActivity ? [...activity.today]
    .filter(log => CATALOG.find(product => product.id === log.productId)?.kind !== "drink")
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
    .slice(0, 50) : [];
  const recent = logs.slice(0, 5);
  const remaining = logs.slice(5);
  const today = activity ? (() => { try { return getZonedParts(new Date(now), activity.timezone).localDate; } catch { return ""; } })() : "";
  const date = logs[0]?.localDate ?? today;
  const dateLabel = date ? calendarLabel(date) : "";
  const isToday = !date || date === today;
  const weeklyCounts = stats?.weeklyCounts ?? [];
  const weeklyMax = Math.max(1, ...weeklyCounts);

  function rows(items: FriendActivityEntry[]) {
    return <ol className="fc-timeline"><AnimatePresence initial={false}>{items.map(log => {
      const product = CATALOG.find(product => product.id === log.productId && product.kind === "cig") ?? CATALOG.find(product => product.id === "other-cig");
      const time = logTime(log, activity!.timezone);
      return <motion.li className="fc-log" key={log.id} layout={reduce?false:"position"} initial={reduce?false:{opacity:0,transform:"translateY(5px)"}} animate={{opacity:1,transform:"translateY(0px)"}} exit={{opacity:0}} transition={{duration:reduce?0:.2,ease:[.2,0,0,1]}}>
        <span className="fc-object" aria-hidden="true">{product ? <ProductShot product={product} size="sm"/> : <Cigarette size={19}/>}</span>
        <div className="fc-log-copy"><strong>{log.productName}</strong><span className="fc-quantity"><span>×{log.quantity}</span><span className="fc-quantity-label">{log.quantity === 1 ? "cigarette" : "cigarettes"}</span></span></div>
        <time className="fc-time" dateTime={log.loggedAt} title={`${dateLabel} at ${time.clock} · ${activity!.timezone}`} aria-label={`${calendarLabel(log.localDate)}, ${time.clock} ${time.zone}`}><strong>{time.clock}</strong><span>{time.zone}</span></time>
      </motion.li>;
    })}</AnimatePresence></ol>;
  }

  return <article className="fc-card" aria-label={`${friend.name}’s activity`}>
    <header className="fc-heading"><span className="fc-avatar" aria-hidden="true">{friend.name.trim().slice(0, 1).toUpperCase() || <UserRound size={18}/>}</span><div className="fc-identity"><h2>{friend.name}</h2><span>@{friend.username}</span></div><span className="fc-connected"><Check size={11} aria-hidden="true"/>Connected</span></header>

    {stats ? <>
      <div className="fc-overview"><div className="fc-today"><span>{isToday ? "Today" : dateLabel}</span><strong><AnimatedValue value={stats.todayCigs}/><small>{stats.todayCigs === 1 ? "cigarette" : "cigarettes"}</small></strong></div><div className="fc-week"><div className="fc-week-bars" role="img" aria-label={`Last seven days: ${weeklyCounts.join(", ")} cigarettes`}>{weeklyCounts.map((count, index) => <span key={index} style={{ height: `${count ? Math.max(5, count / weeklyMax * 26) : 2}px` }} aria-hidden="true"/>)}</div><span>{stats.weekCigs} this week · {fmtINR(stats.weekSpend)}</span></div></div>

      {showActivity ? <section className="fc-activity" aria-label="Shared cigarette check-ins">
        <div className="fc-timeline-heading"><h3>{isToday ? "Today’s check-ins" : "Cigarette check-ins"}</h3><span>{dateLabel}</span></div>
        <p className="fc-timezone">Times in <span>{activity.timezone.replaceAll("_", " ")}</span>{logs.length > 1 && <span className="fc-order">Latest first</span>}</p>
        {recent.length ? rows(recent) : <div className="fc-empty"><Cigarette size={17} aria-hidden="true"/><p>No cigarettes logged{isToday ? " today" : " on this day"}.</p></div>}
        {remaining.length > 0 && <details className="fc-more"><summary>Show {remaining.length} more {remaining.length === 1 ? "check-in" : "check-ins"}<ChevronDown size={15} aria-hidden="true"/></summary>{rows(remaining)}</details>}
        {activity.truncated && <p className="fc-truncated">Showing the latest {logs.length} check-ins today. The total above includes all cigarettes logged.</p>}
      </section> : <>
        {sharing === "summary" && <p className="fc-last-time">{stats.lastLoggedAt ? `Last cigarette: ${timeSince(stats.lastLoggedAt, now) === "Just now" ? "just now" : `${timeSince(stats.lastLoggedAt, now)} ago`}` : "No cigarette logs yet."}</p>}
        <p className="fc-summary-note"><Lock size={13} aria-hidden="true"/>{sharing === "summary" ? "Individual brands and check-ins aren’t shared." : "Detailed check-ins aren’t available right now."}</p>
      </>}
    </> : <div className="fc-private"><Lock size={18} aria-hidden="true"/><div><strong>Keeping their activity private.</strong><p>You’re connected. Their logs and spending stay private.</p></div></div>}

    <details className="fc-options"><summary>Connection options<ChevronDown size={14} aria-hidden="true"/></summary><p>Removing this friend ends shared access for both of you.</p><button type="button" disabled={pending} onClick={() => onRemove(friend.id)}><X size={14} aria-hidden="true"/>Remove friend</button></details>
  </article>;
}
