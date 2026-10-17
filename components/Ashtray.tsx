"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LayoutDashboard, BarChart3, Users, IndianRupee, Settings, Plus, ArrowUpRight, ArrowRight, Clock, Wallet, Search, X, LogOut, Copy, Check, Wine, Download, Lock, User as UserIcon, Trash2, Star, Leaf, Cigarette, Target, Shield, BookOpen, ChevronRight } from "lucide-react";
import { CATALOG, displayCost, type Kind } from "@/lib/catalog";
import { getPriceReference, suggestedLoosePrice, PRICE_CHECKED_AT } from "@/lib/pricing";
import { dashboard, timeSince } from "@/lib/dashboard";
import { fmtINR } from "@/lib/time";
import type { TrackerState, SocialEvent, User } from "@/lib/social-types";
import ProgressChart from "./ProgressChart";
import MobileHome from "./MobileHome";
import MobileShelf from "./MobileShelf";
import FriendCard from "./FriendCard";
import { Burst } from "./Burst";
import { ProductShot } from "./ProductShot";
import { useTrackerState } from "@/lib/use-tracker-state";
import type { ObjectOrigin } from "@/lib/object-origin";

const blank: TrackerState = { user: null, events: [], friends: [], requests: [], sentRequests: [] };
const navigation = [
  { id: "today", label: "Overview", icon: LayoutDashboard },
  { id: "insights", label: "Insights", icon: BarChart3 },
  { id: "activity", label: "Activity", icon: BookOpen },
  { id: "circle", label: "Your circle", icon: Users },
  { id: "prices", label: "Price guide", icon: IndianRupee },
  { id: "settings", label: "Settings", icon: Settings },
];
type View = typeof navigation[number]["id"];
type Modal = "auth" | "log" | "invite" | "delete" | "shelf" | null;

function ModalShell({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{y:number;start:number;distance:number}|null>(null);
  const dragged = useRef(false);
  const closingRef = useRef(false);
  const [closing, setClosing] = useState(false);
  const closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const node = dialog.current; node?.showModal();
    return () => { if(timer.current) clearTimeout(timer.current); node?.close(); if(trigger?.isConnected) trigger.focus(); else document.querySelector<HTMLElement>("main")?.focus(); };
  }, []);
  function dismiss() {
    if (closingRef.current) return;
    closingRef.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { closeRef.current(); return; }
    setClosing(true); timer.current = setTimeout(() => closeRef.current(), 160);
  }
  return <dialog ref={dialog} className="modal" data-closing={closing||undefined} aria-labelledby="modal-title" onCancel={event=>{event.preventDefault();dismiss();}} onClick={event=>{if(event.target===event.currentTarget)dismiss();}}>
    <div className="modal-inner">
      <button type="button" className="sheet-grabber" aria-label="Close sheet" onClick={()=>{if(dragged.current){dragged.current=false;return;}dismiss();}}
        onPointerDown={event=>{if(!event.isPrimary)return;dragged.current=false;drag.current={y:event.clientY,start:performance.now(),distance:0};event.currentTarget.setPointerCapture(event.pointerId);dialog.current?.setAttribute("data-dragging","true");}}
        onPointerMove={event=>{if(!drag.current)return;drag.current.distance=Math.max(0,event.clientY-drag.current.y);if(Math.abs(event.clientY-drag.current.y)>5)dragged.current=true;dialog.current?.style.setProperty("--sheet-drag",`${drag.current.distance}px`);}}
        onPointerUp={()=>{const gesture=drag.current;drag.current=null;dialog.current?.removeAttribute("data-dragging");if(gesture&&(gesture.distance>72||(gesture.distance>20&&gesture.distance/Math.max(performance.now()-gesture.start,1)>.45))){dismiss();}else dialog.current?.style.setProperty("--sheet-drag","0px");}}
        onPointerCancel={()=>{drag.current=null;dialog.current?.removeAttribute("data-dragging");dialog.current?.style.setProperty("--sheet-drag","0px");}}><span/></button>
      <div className="modal-heading"><h2 id="modal-title">{title}</h2><button type="button" className="icon-button" onClick={dismiss} aria-label="Close dialog"><X size={20}/></button></div>{children}
    </div>
  </dialog>;
}
function Empty({ icon = "log", title, children, action }: { icon?: "log" | "circle"; title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty"><span className="empty-icon">{icon === "circle" ? <Users size={24}/> : <BookOpen size={24}/>}</span><h3>{title}</h3><p>{children}</p>{action}</div>;
}
export default function Ashtray() {
  const { data, loaded, available, pending, error, setError, refresh, mutate, syncStatus, lastSyncedAt, recoveredLog } = useTrackerState();
  const [view, setView] = useState<View>("today");
  const [modal, setModal] = useState<Modal>(null);
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const [priceKind, setPriceKind] = useState<Kind>("cig");
  const [activityKind, setActivityKind] = useState("all");
  const [logKind, setLogKind] = useState<Kind>("cig");
  const [productId, setProductId] = useState("marlboro-advance");
  const [quantity, setQuantity] = useState(1);
  const [paid, setPaid] = useState(25);
  const [inviteCode, setInviteCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState<SocialEvent | null>(null);
  const [burst, setBurst] = useState<{id:string;nonce:number;origin?:ObjectOrigin}|null>(null);
  const [lastLogged, setLastLogged] = useState<{id:string;name:string}|null>(null);
  const user = data.user;
  const timezone = user?.timezone ?? "Asia/Kolkata";
  const stats = useMemo(() => dashboard(data.events, timezone, new Date(now ?? "2026-10-16T00:00:00Z")), [data.events, timezone, now]);
  const limit = user?.dailyLimit ?? 8;

  useEffect(() => { if (!burst) return; const t=setTimeout(() => setBurst(null), 2700); return () => clearTimeout(t); },[burst]);
  useEffect(() => { if(recoveredLog){setNotice(`${recoveredLog.name} saved · connection restored.`);setLastLogged({id:recoveredLog.id,name:recoveredLog.name});} },[recoveredLog]);

  useEffect(() => {
    setNow(Date.now());
    const hash = () => { const value = location.hash.slice(1); if (navigation.some(n => n.id === value)) setView(value); };
    hash(); window.addEventListener("hashchange", hash);
    const code = new URLSearchParams(location.search).get("invite");
    if (code) { setInviteCode(code); setView("circle"); location.hash = "circle"; }
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => { clearInterval(t); window.removeEventListener("hashchange", hash); };
  }, []);
  async function run(action: string, input: Record<string, unknown> = {}, message = "") {
    setLastLogged(null);
    const result = await mutate(action, input);
    if (result && message) setNotice(message);
    return result;
  }
  function go(next: View) { setView(next); setError(""); window.location.hash = next; window.scrollTo({ top: 0 }); }
  function open(next: Modal) { setError(""); setNotice(""); if(next==="invite")setCopied(false); setModal(next); }
  function requireUser(next: Exclude<Modal, "auth" | null>) { if (!user) open("auth"); else open(next); }
  function unitPrice(id: string) { const p = CATALOG.find(p => p.id === id)!; return user?.priceOverrides[id] ?? (p.kind === "cig" ? suggestedLoosePrice(id, user?.defaultPrice ?? 25) : displayCost(p)); }
  function startLog(kind: Kind = "cig", id?: string) {
    setLogKind(kind); const chosen = id ?? (kind === "cig" ? user?.favoriteIds[0] ?? "marlboro-advance" : "kingfisher-premium");
    setProductId(chosen); setPaid(unitPrice(chosen)); setQuantity(1); requireUser("log");
  }

  const date = now ? new Date(now).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", timeZone: timezone }) : "Loading date…";
  const eventRows = stats.sorted.filter(e => activityKind === "all" || e.kind === activityKind);

  async function copyInvite() {
    if (!user) return;
    try {
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
      const network = local ? await fetch("/api/network").then(r => r.ok ? r.json() : null).catch(() => null) : null;
      const origin = network?.networkUrl ?? location.origin;
      await navigator.clipboard.writeText(`${origin}/?invite=${encodeURIComponent(user.inviteCode)}#circle`); setCopied(true);
    }
    catch { setNotice(`Copy your invite code: ${user.inviteCode}`); }
  }
  function exportCsv() {
    const safe = (v: unknown) => { const s = String(v ?? ""); return '"' + (/^[=+@\-]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"'; };
    const rows = [["Date", "Time", "Product", "Kind", "Quantity", "Price paid per unit INR", "Total INR", "Note"], ...stats.sorted.map(e => [e.localDate, e.localTime, e.productName, e.kind, e.quantity, e.unitCostInr, e.quantity * e.unitCostInr, e.note ?? ""])];
    const a = document.createElement("a"); const url = URL.createObjectURL(new Blob([rows.map(r => r.map(safe).join(",")).join("\n")], { type: "text/csv;charset=utf-8" })); a.href = url; a.download = `ashtray-${stats.today}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  function logRows(rows: SocialEvent[], compact = false) {
    return rows.length ? <div className="log-list">{rows.map(e => <div className="log-row" key={e.id}>
      <span className={`log-icon ${e.kind === "drink" ? "drink" : ""}`}>{e.kind === "cig" ? <Cigarette size={19}/> : <Wine size={19}/>}</span>
      <div className="log-info"><strong>{e.productName}</strong><span>{e.localDate === stats.today ? "Today" : new Date(e.localDate + "T12:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })} · {e.localTime} · {e.quantity} {e.kind === "cig" ? (e.quantity === 1 ? "cigarette" : "cigarettes") : "serving"}{e.note ? ` · ${e.note}` : ""}</span></div>
      <strong className="log-amount">{fmtINR(e.unitCostInr * e.quantity)}</strong>
      {!compact && <button className="icon-button delete-trigger" aria-label={`Delete ${e.productName} log at ${e.localTime}`} onClick={() => { setDeleting(e); open("delete"); }}><Trash2 size={17}/></button>}
    </div>)}</div> : <Empty title="A fresh page">Your logs will appear here. Start with a quick check-in.</Empty>;
  }
  async function quickLog(id:string, origin?:ObjectOrigin) {
    if (pending) return;
    if (!user) { open("auth"); return; }
    const p=CATALOG.find(p=>p.id===id)!;
    const previous = new Set(data.events.map(e=>e.id));
    const result = await run("log", {productId:id,quantity:1,unitCostInr:unitPrice(id),source:"shelf"}, `${p.name} · ${fmtINR(unitPrice(id))}`);
    if (result) {
      setModal(null); setBurst({id,nonce:Date.now(),origin});
      const saved=result.events.find(e=>!previous.has(e.id));
      if (saved) setLastLogged({id:saved.id,name:saved.productName});
      if (navigator.vibrate) navigator.vibrate(15);
    }
  }
  function openShelf(kind:Kind) {setPriceKind(kind);open("shelf");}
  async function toggleFavorite(id:string) {
    if (!user) {open("auth");return;}
    const p=CATALOG.find(p=>p.id===id)!;
    const same=user.favoriteIds.filter(x=>CATALOG.find(p=>p.id===x)?.kind===p.kind);
    const others=user.favoriteIds.filter(x=>CATALOG.find(p=>p.id===x)?.kind!==p.kind);
    const next=same.includes(id)?same.filter(x=>x!==id):[id,...same].slice(0,3);
    await run("settings",{favoriteIds:[...next,...others]},"Shelf updated.");
  }
  const shelfProps={kind:priceKind,user,pending,onQuickLog:(id:string,origin?:ObjectOrigin)=>void quickLog(id,origin),onDetailedLog:(id:string)=>startLog(CATALOG.find(p=>p.id===id)!.kind,id),onFavorite:(id:string)=>void toggleFavorite(id)};
  const bottomNav=[{id:"today",name:"Track",icon:Cigarette},{id:"circle",name:"Circle",icon:Users},{id:"insights",name:"Stats",icon:BarChart3},{id:"prices",name:"Shelf",icon:Plus}];
  return <div className="phone-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="phone-header">
      <a href="#today" className="phone-wordmark" onClick={()=>go("today")}>ASHTRAY</a>
      <div className="phone-header-actions">
        {user&&<button className={`sync-indicator is-${syncStatus}`} onClick={()=>void refresh()} aria-label={`${syncStatus === "live" ? "Live sync connected" : syncStatus === "offline" ? "Offline, showing last saved data" : "Sync reconnecting"}. Refresh now.`} title={lastSyncedAt?`Last synced ${new Date(lastSyncedAt).toLocaleTimeString("en-IN")}`:"Connecting…"}><span/>{syncStatus === "live" ? "Live" : syncStatus === "offline" ? "Offline" : syncStatus === "paused" ? "Paused" : "Syncing"}</button>}
        <button className="account-button" onClick={()=>user?go("settings"):open("auth")} aria-label={user?`Account for ${user.name}`:"Log in or create an account"}>{user?<span className="account-dot">{user.name.slice(0,1).toUpperCase()}</span>:"Log in"}</button>
        <button className="icon-button" aria-label="Open settings" onClick={()=>go("settings")}><Settings size={20}/></button>
      </div>
    </header>
    <main id="main" tabIndex={-1}>
      {view==="today"?<h1 className="sr-only">Ashtray tracker</h1>:<div className="screen-title"><h1>{({insights:"Stats",activity:"History",circle:"Your circle",prices:"Shelf",settings:"Settings"} as Record<string,string>)[view]}</h1><span>{view==="circle"?"Just your people.":view==="prices"?"One tap. One honest log.":view==="insights"?"A little perspective.":""}</span></div>}
      {error&&!modal&&<div className="error" role="alert"><span>{error}</span><button className="text-button" onClick={()=>void refresh()}>Try again</button></div>}
      {!loaded&&<div className="loading-line" role="status">Opening your tracker…</div>}
      {loaded&&available&&<>
        {view==="today"&&<MobileHome data={data} now={now??Date.now()} pending={pending} onLog={(id,origin)=>void quickLog(id,origin)} onOpenShelf={openShelf} onViewActivity={()=>go("activity")} onSettings={()=>user?go("settings"):open("auth")}/>}
        {view==="insights"&&<>
          <div className="plain-stats"><div><span>LAST 7 DAYS</span><strong>{stats.weekCount}<small> cigarettes</small></strong></div><div><span>SPENT</span><strong>{fmtINR(stats.weekSpend)}</strong></div></div>
          <section className="panel"><div className="section-top"><h2>Last 7 days</h2><span className="small muted">Limit {limit}/day</span></div><ProgressChart days={stats.days} limit={limit} today={stats.today}/><p className="method-note">Empty days mean no logs, not confirmed smoke-free days.</p></section>
          <div className="plain-stats"><div><span>ON LOGGED DAYS</span><strong>{stats.average.toFixed(1)}<small> / day</small></strong></div><div><span>ALL-TIME SPEND</span><strong>{fmtINR(stats.totalSpend)}</strong></div></div>
          <button className="button secondary full" onClick={()=>go("activity")}>Open history <ArrowRight size={16}/></button>
        </>}
        {view==="activity"&&<><div className="history-tools"><div className="segmented" aria-label="Activity type">{[["all","All"],["cig","Smoke"],["drink","Drink"]].map(([key,name])=><button key={key} aria-pressed={activityKind===key} className={activityKind===key?"selected":""} onClick={()=>setActivityKind(key)}>{name}</button>)}</div><button className="icon-button" aria-label="Export history as CSV" onClick={exportCsv} disabled={!data.events.length}><Download size={19}/></button></div>{logRows(eventRows)}<p className="method-note">Prices stay as recorded. Each entry keeps its original local time.</p></>}
        {view==="circle"&&<>
          <button className={`circle-invite-button${data.friends.length?" has-friends":""}`} onClick={()=>requireUser("invite")}><span className="invite-plus"><Plus size={24}/></span><span><strong>Bring a friend</strong><small>They get their own account.</small></span><ArrowUpRight size={19}/></button>
          {user&&<><div className="sharing-note"><Lock size={13}/><span>{user.sharing==="activity"?"Brands, quantities & times shared":user.sharing==="summary"?"Counts and latest cigarette time shared":"Your activity is private"}</span><button className="text-button" onClick={()=>go("settings")}>Edit</button></div><label className="circle-sharing-toggle"><span><strong>Share cigarette details</strong><small>Brands, quantities & times with accepted friends.</small></span><input type="checkbox" role="switch" aria-label="Share cigarette brands, quantities and times with accepted friends" checked={user.sharing==="activity"} disabled={pending} onChange={e=>void run("settings",{sharing:e.target.checked?"activity":"summary"},e.target.checked?"Cigarette details shared with your circle.":"Your circle sees counts only.")}/></label></>}
          {data.requests.length>0&&<section className="requests"><h2>Requests</h2>{data.requests.map(r=><div className="request-row" key={r.id}><span className="avatar">{r.name.slice(0,1).toUpperCase()}</span><div><strong>{r.name}</strong><small>@{r.username}</small></div><button className="icon-button" aria-label={`Decline ${r.name}`} disabled={pending} onClick={()=>void run("respond",{id:r.id,accept:false},"Request declined.")}><X size={18}/></button><button className="button primary small" disabled={pending} onClick={()=>void run("respond",{id:r.id,accept:true},"You’re connected.")}>Accept</button></div>)}</section>}
          {data.friends.length?<div className="friend-list">{data.friends.map(friend=><FriendCard key={friend.id} friend={friend} now={now??Date.now()} pending={pending} onRemove={id=>void run("remove",{id},"Friend removed.")}/>)}</div>:<div className="circle-empty"><div className="circle-objects" aria-hidden="true"><ProductShot product={CATALOG.find(p=>p.id==="marlboro-advance")!} size="lg"/><ProductShot product={CATALOG.find(p=>p.id==="marlboro-red")!} size="lg"/></div><h2>A friend in your corner.</h2><p>Connect by invitation. See each other’s check-ins.<br/>Keep the details you want private.</p></div>}
          {data.sentRequests.length>0&&<section className="requests"><h2>Pending</h2>{data.sentRequests.map(r=><div className="request-row" key={r.id}><span className="avatar">{r.name.slice(0,1).toUpperCase()}</span><div><strong>{r.name}</strong><small>@{r.username}</small></div><span className="pill">Waiting for a reply</span></div>)}</section>}
          <p className="method-note sync-note">{!user ? "Create an account to connect your circle." : syncStatus === "live" ? "Live circle · updates arrive in a few seconds." : "Reconnecting your circle · showing last saved updates."} Notes and drink logs stay yours.</p>
        </>}
        {view==="prices"&&<><div className="segmented shelf-kind" aria-label="Shelf type"><button aria-pressed={priceKind==="cig"} className={priceKind==="cig"?"selected":""} onClick={()=>setPriceKind("cig")}><Cigarette size={16}/>Smoke</button><button aria-pressed={priceKind==="drink"} className={priceKind==="drink"?"selected":""} onClick={()=>setPriceKind("drink")}><Wine size={16}/>Drink</button></div><MobileShelf {...shelfProps}/></>}
        {view==="settings"&&(user?<SettingsPanel user={user} pending={pending} save={async values=>{await run("settings",values,"Settings saved.");}} logout={async()=>{if(await run("logout",{},"Logged out."))go("today");}}/>:<div className="account-empty"><UserIcon size={26}/><h2>Make it yours.</h2><p>Your own logs, your own shelf,<br/>and a circle of friends.</p><button className="button primary full" onClick={()=>open("auth")}>Create account / log in<ArrowRight size={17}/></button></div>)}
      </>}
      {view==="today"&&loaded&&!user&&<button className="save-account-hint" onClick={()=>open("auth")}><Lock size={12}/>Create your account & connect with friends<ArrowUpRight size={13}/></button>}
    </main>
    <nav className="phone-nav" aria-label="App navigation">{bottomNav.map(n=><a key={n.id} href={`#${n.id}`} aria-current={view===n.id?"page":undefined} className={view===n.id?"active":""} onClick={()=>go(n.id)}><span><n.icon size={21}/>{n.id==="circle"&&data.requests.length>0&&<i>{data.requests.length}</i>}</span><span>{n.name}</span></a>)}</nav>
    <div className="announcements" role="status" aria-live="polite">{notice&&<div className="mobile-toast"><Check size={17}/><span>{notice}</span>{lastLogged&&<button className="text-button" disabled={pending} onClick={async()=>{if(await run("delete",{id:lastLogged.id},"Log undone."))setLastLogged(null);}}>Undo</button>}<button className="icon-button" aria-label="Dismiss notification" onClick={()=>{setNotice("");setLastLogged(null);}}><X size={16}/></button></div>}</div>
    <Burst product={burst?CATALOG.find(p=>p.id===burst.id)??null:null} nonce={burst?.nonce??0} origin={burst?.origin} onComplete={()=>setBurst(null)}/>
    {modal==="shelf"&&<ModalShell title={priceKind==="cig"?"Smoke shelf":"Drink shelf"} close={()=>setModal(null)}><MobileShelf {...shelfProps}/>{error&&<p className="error" role="alert">{error}</p>}</ModalShell>}

    {modal === "auth" && <ModalShell title={authMode === "register" ? "Your own Ashtray." : "Welcome back."} close={() => setModal(null)}><p className="muted">{authMode === "register" ? "Create your own username and password. Your logs save to your account." : "Sign in to see your saved logs and circle."}</p><div className="segmented auth-tabs"><button aria-pressed={authMode === "register"} className={authMode === "register" ? "selected" : ""} onClick={() => { setAuthMode("register"); setError(""); }}>Create account</button><button aria-pressed={authMode === "login"} className={authMode === "login" ? "selected" : ""} onClick={() => { setAuthMode("login"); setError(""); }}>Log in</button></div><form key={authMode} onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); if (await run(authMode, { name: f.get("name"), username: f.get("username"), password: f.get("password") }, authMode === "register" ? "Your account is ready. Make yourself at home." : "Welcome back.")) { setModal(null); if (inviteCode) { go("circle"); setModal("invite"); } } }}>
      {authMode === "register" && <label>What should we call you?<input name="name" autoComplete="name" required maxLength={60} placeholder="Your name"/></label>}
      <label>Username<input name="username" autoComplete="username" required minLength={3} maxLength={24} pattern="[a-zA-Z0-9][a-zA-Z0-9_]{2,23}" placeholder="e.g. prabhas" autoCapitalize="none" spellCheck={false}/><span className="field-hint">3–24 letters, numbers, or underscores. Start with a letter or number.</span></label>
      <label>Password<input name="password" type="password" autoComplete={authMode === "register" ? "new-password" : "current-password"} required minLength={8} maxLength={128} placeholder={authMode === "register" ? "Choose at least 8 characters" : "Your password"}/></label>
      {authMode === "register" && <p className="privacy-copy"><Lock size={15}/>Accepted friends see your cigarette counts. You can choose to share brands and times in Circle, or keep all activity private in Settings. Keep your password safe; password reset isn’t available yet.</p>}
      {error && <p className="error" role="alert">{error}</p>}<button className="button primary full" disabled={pending}>{pending ? "Please wait…" : authMode === "register" ? "Create account" : "Log in"}<ArrowRight size={17}/></button></form><p className="modal-foot">Each friend creates a separate account. Your account and logs are saved on this server, and you can sign in from another device.</p></ModalShell>}

    {modal === "log" && <ModalShell title="Edit this check-in" close={() => setModal(null)}><form onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); if (await run("log", { productId, quantity, unitCostInr: paid, note: f.get("note") ?? "", source: "picker" }, `${quantity} ${logKind === "cig" ? "cigarette" : "drink"}${quantity > 1 ? "s" : ""} logged · ${fmtINR(paid * quantity)}.`)) { setModal(null); setBurst({id:productId,nonce:Date.now()}); } }}><div className="segmented auth-tabs"><button type="button" aria-pressed={logKind === "cig"} className={logKind === "cig" ? "selected" : ""} onClick={() => { setLogKind("cig"); setProductId("marlboro-advance"); setPaid(unitPrice("marlboro-advance")); }}>Cigarette</button><button type="button" aria-pressed={logKind === "drink"} className={logKind === "drink" ? "selected" : ""} onClick={() => { setLogKind("drink"); setProductId("kingfisher-premium"); setPaid(unitPrice("kingfisher-premium")); }}>Drink</button></div><label>Brand & variant<select value={productId} onChange={e => { setProductId(e.target.value); setPaid(unitPrice(e.target.value)); }}>{CATALOG.filter(p => p.kind === logKind).map(p => <option value={p.id} key={p.id}>{p.name}{p.kind === "drink" ? ` · ${p.volumeMl}ml ${p.unitName}` : ""}</option>)}</select></label><div className="form-grid"><label>Quantity<input type="number" min={1} max={100} step={1} value={quantity} onChange={e => setQuantity(Number(e.target.value))} required inputMode="numeric"/></label><label>Price paid per {logKind === "cig" ? "stick" : "serving"} (₹)<input type="number" min={0} max={100000} step={0.01} value={paid} onChange={e => setPaid(Number(e.target.value))} required inputMode="decimal"/></label></div><p className="reference-hint">{getPriceReference(productId) ? `Pack reference: ${fmtINR(getPriceReference(productId)!.unitPrice)} per stick. Your shop’s loose price may differ.` : "Enter what you actually paid. Catalogue prices are estimates where unverified."}</p><label>A little context <span className="muted">(optional)</span><input name="note" maxLength={200} placeholder="After lunch, with coffee, feeling stressed…"/><span className="field-hint">Notes stay private, even when you share a summary.</span></label><div className="log-total"><span>Total for this check-in</span><strong>{fmtINR(paid * quantity)}</strong></div><p className="small muted">Logged now in {timezone}. Price is saved with this entry.</p>{error && <p className="error" role="alert">{error}</p>}<button className="button primary full" disabled={pending}><Plus size={18}/>{pending ? "Saving…" : "Save check-in"}</button></form></ModalShell>}

    {modal === "invite" && user && <ModalShell title="Invite a friend" close={() => setModal(null)}><p className="muted">You each use your own login. Each person’s logs save to their own account.</p><ol className="invite-steps"><li>Copy your invite link and send it to your friend.</li><li>They open it, create an account and send you a request.</li><li>Accept the request in Circle. You each choose what to share.</li></ol><div className="invite-code"><span className="eyebrow">YOUR PRIVATE INVITE CODE</span><strong>{user.inviteCode}</strong><button className="button secondary full" onClick={() => void copyInvite()}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? "Invite link copied" : "Copy invite link"}</button></div><form onSubmit={async e => { e.preventDefault(); if (await run("request", { code: inviteCode.trim() }, "Friend request sent. They’ll need to accept it.")) setInviteCode(""); }}><label>Have a friend’s code?<input value={inviteCode} onChange={e => setInviteCode(e.target.value)} required maxLength={64} placeholder="Paste their invite code" autoCapitalize="none" spellCheck={false}/></label>{error && <p className="error" role="alert">{error}</p>}{notice && <p className="success-text" role="status">{notice}</p>}<button className="button dark full" disabled={pending}>{pending ? "Sending…" : "Send friend request"}<ArrowRight size={16}/></button></form><p className="privacy-copy"><Lock size={15}/>Both people must accept the connection before any summary is visible. Your sharing setting: {user.sharing === "activity" ? "cigarette brands, quantities and times" : user.sharing === "summary" ? "cigarette counts only" : "activity private"}.</p><p className="modal-foot">Your friend opens the same app address to sign in. If you’re using localhost, share the Network address on the same Wi-Fi.</p></ModalShell>}

    {modal === "delete" && deleting && <ModalShell title="Delete this check-in?" close={() => setModal(null)}><p className="muted">{deleting.productName} · {deleting.localDate} at {deleting.localTime} · {fmtINR(deleting.quantity * deleting.unitCostInr)}. This entry will be permanently removed from your ledger.</p>{error && <p className="error" role="alert">{error}</p>}<div className="dialog-actions"><button className="button secondary" onClick={() => setModal(null)}>Cancel</button><button className="button destructive" disabled={pending} onClick={async () => { if (await run("delete", { id: deleting.id }, "Check-in deleted.")) setModal(null); }}>{pending ? "Deleting…" : "Delete check-in"}</button></div></ModalShell>}
  </div>;
}

function SettingsPanel({ user, pending, save, logout }: { user: User; pending: boolean; save: (v: Record<string, unknown>) => Promise<void>; logout: () => Promise<void> }) {
  return <form onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); await save({ name: f.get("name"), city: f.get("city"), timezone: f.get("timezone"), dailyLimit: Number(f.get("dailyLimit")), cigBaseline: Number(f.get("cigBaseline")), defaultPrice: Number(f.get("defaultPrice")), sharing: f.get("sharing") }); }}><div className="settings-grid"><section className="panel"><div className="settings-title"><UserIcon size={20}/><h2>The basics</h2></div><label>Display name<input name="name" defaultValue={user.name} maxLength={60} required autoComplete="name"/></label><label>Username<input value={`@${user.username}`} readOnly aria-describedby="username-hint"/><span id="username-hint" className="field-hint">Your unique username stays the same.</span></label><label>City <span className="muted">(optional)</span><input name="city" defaultValue={user.city} maxLength={100} autoComplete="address-level2" placeholder="e.g. Bengaluru"/></label><label>Timezone<select name="timezone" defaultValue={user.timezone}>{Array.from(new Set([user.timezone, "Asia/Kolkata", "Asia/Dubai", "Europe/London", "America/New_York", "America/Los_Angeles", "Asia/Singapore", "Australia/Sydney"])).map(t => <option key={t}>{t}</option>)}</select></label></section><section className="panel"><div className="settings-title"><Target size={20}/><h2>Your pace</h2></div><div className="form-grid"><label>Daily cigarette limit<input type="number" name="dailyLimit" min={1} max={100} step={1} defaultValue={user.dailyLimit} required/></label><label>Starting daily baseline<input type="number" name="cigBaseline" min={0} max={200} step={1} defaultValue={user.cigBaseline} required/></label></div><label>Usual loose price (₹)<input name="defaultPrice" type="number" min={0} max={100000} step={0.01} defaultValue={user.defaultPrice} required/><span className="field-hint">Used as the suggested price for full-size premium cigarettes. Adjust the actual price when logging.</span></label><p className="method-note">A lower limit can help you track your intention. No level of cigarette smoking is safe.</p></section><section className="panel privacy-settings"><div className="settings-title"><Shield size={20}/><h2>You choose what’s shared</h2></div><fieldset><legend>Activity visibility</legend><label className="radio-choice"><input type="radio" name="sharing" value="activity" defaultChecked={user.sharing === "activity"}/><span><strong>Cigarette details with accepted friends</strong><small>Today’s brands, quantities and exact local times, plus your cigarette summary. Notes and drinks stay private.</small></span></label><label className="radio-choice"><input type="radio" name="sharing" value="summary" defaultChecked={user.sharing === "summary"}/><span><strong>Cigarette counts only</strong><small>Today’s cigarette count, weekly cigarette pattern and spend, daily limit, and last cigarette log time.</small></span></label><label className="radio-choice"><input type="radio" name="sharing" value="private" defaultChecked={user.sharing === "private"}/><span><strong>Keep my activity private</strong><small>Friends see your name and connection only. All activity and spending stay private.</small></span></label></fieldset><div className="privacy-note"><Lock size={17}/><p>Your notes, password, drink logs and individual paid prices are never shared with friends. Cigarette brands and times are shared only when you choose details. There is no public profile or search directory.</p></div></section></div><div className="settings-actions"><button className="button primary" disabled={pending}>{pending ? "Saving…" : "Save settings"}<Check size={17}/></button><button className="text-button" type="button" disabled={pending} onClick={() => void logout()}><LogOut size={16}/>Log out</button></div></form>;
}
