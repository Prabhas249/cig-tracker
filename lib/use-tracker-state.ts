"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TrackerState } from "./social-types";

export type SyncStatus = "connecting" | "live" | "reconnecting" | "offline" | "paused" | "local";
const EMPTY: TrackerState = { user: null, events: [], friends: [], requests: [], sentRequests: [] };
const CONNECTION_ERRORS = ["Unable to load your tracker. Try again.", "Unable to reach the tracker. Check your connection and try again.", "You’re offline. Reconnect to open your tracker."];

function requestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const s = Array.from(bytes, n => n.toString(16).padStart(2, "0")).join("");
  return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
}

/** Serialize snapshots around mutations so an old refresh cannot replace a saved log. */
export function useTrackerState() {
  const [data, setData] = useState<TrackerState>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [available, setAvailable] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("connecting");
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [recoveredLog, setRecoveredLog] = useState<{id:string;name:string;at:number}|null>(null);
  const epoch = useRef(0);
  const getSerial = useRef(0);
  const active = useRef(true);
  const mutationActive = useRef(false);
  const queuedRefresh = useRef(false);
  const getAbort = useRef<AbortController | null>(null);
  const mutationAbort = useRef<AbortController | null>(null);
  const revision = useRef<string | undefined>(undefined);
  const currentUser = useRef<string | undefined>(undefined);
  const channel = useRef<BroadcastChannel | null>(null);
  const retryIds = useRef(new Map<string, string>());
  const uncertainLogs = useRef(new Map<string, string>());
  const connectionLive = useRef(false);
  const lastSuccessful = useRef(0);
  const hasSnapshot = useRef(false);
  const seenNotices = useRef(new Set<string>());

  const apply = useCallback((next: TrackerState) => {
    if (!active.current) return;
    if(currentUser.current !== next.user?.id) {
      retryIds.current.clear(); uncertainLogs.current.clear(); setRecoveredLog(null);
    }
    revision.current = next.revision;
    currentUser.current = next.user?.id;
    lastSuccessful.current = Date.now();
    hasSnapshot.current = true;
    for (const event of next.events) {
      const confirmed = event.requestId;
      if (confirmed) {
        const message = uncertainLogs.current.get(confirmed);
        if (message) {
          uncertainLogs.current.delete(confirmed);
          setError(previous => previous === message ? "" : previous);
          setRecoveredLog({id:event.id,name:event.productName,at:Date.now()});
        }
        for (const [signature,id] of retryIds.current) if(id===confirmed) retryIds.current.delete(signature);
      }
    }
    setData(next); setAvailable(true); setLoaded(true); setLastSyncedAt(lastSuccessful.current);
    setError(previous => CONNECTION_ERRORS.includes(previous) ? "" : previous);
    if (!next.user) setSyncStatus("local");
  }, []);

  const refresh = useCallback(async () => {
    if (!active.current) return;
    if (mutationActive.current) { queuedRefresh.current = true; return; }
    if (!navigator.onLine) { setSyncStatus("offline"); if(!hasSnapshot.current)setError(CONNECTION_ERRORS[2]); setLoaded(true); return; }
    const generation = epoch.current;
    const serial = ++getSerial.current;
    getAbort.current?.abort();
    const controller = new AbortController();
    getAbort.current = controller;
    const timeout = setTimeout(() => controller.abort("timeout"), 10_000);
    try {
      const res = await fetch("/api/tracker", { cache: "no-store", signal: controller.signal });
      if (!res.ok) throw new Error("Unable to load your tracker. Try again.");
      const next = await res.json() as TrackerState;
      if (!active.current || generation !== epoch.current || serial !== getSerial.current || mutationActive.current) return;
      apply(next);
      if (next.user && connectionLive.current) setSyncStatus("live");
      return next;
    } catch (cause) {
      if (!active.current || generation !== epoch.current || serial !== getSerial.current || (controller.signal.aborted && controller.signal.reason !== "timeout")) return;
      setSyncStatus(navigator.onLine ? "reconnecting" : "offline");
      // Keep previously saved data visible while reconnecting; initial failure needs recovery.
      if (!hasSnapshot.current) setError(cause instanceof Error && cause.message === CONNECTION_ERRORS[0] ? cause.message : CONNECTION_ERRORS[1]);
      setLoaded(true);
    } finally { clearTimeout(timeout); }
  }, [apply]);

  const announceChange = useCallback((action: string) => {
    const notice = { type: ["login","register","logout"].includes(action) ? "auth-changed" : "changed", id:requestId() };
    channel.current?.postMessage(notice);
    try { localStorage.setItem("ashtray:changed", JSON.stringify(notice)); } catch { /* Private browsing can disable storage. */ }
  }, []);

  const mutate = useCallback(async (action: string, input: Record<string, unknown> = {}): Promise<TrackerState | false> => {
    if (mutationActive.current) return false;
    if (!navigator.onLine) { setSyncStatus("offline"); setError(action === "log" ? "You’re offline. Reconnect before saving this check-in." : "You’re offline. Reconnect before saving your changes."); return false; }
    mutationActive.current = true;
    epoch.current += 1;
    const generation = epoch.current;
    getAbort.current?.abort();
    setPending(true); setError("");
    const signature = action === "log" ? JSON.stringify(input) : "";
    let logRequestId: string | undefined;
    if (action === "log") {
      logRequestId = retryIds.current.get(signature) ?? requestId();
      retryIds.current.set(signature, logRequestId);
      if (retryIds.current.size > 20) {
        const oldest = retryIds.current.keys().next().value!;
        const id = retryIds.current.get(oldest); if(id) uncertainLogs.current.delete(id);
        retryIds.current.delete(oldest);
      }
    }
    const controller = new AbortController();
    mutationAbort.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12_000);
    let rejected = false;
    try {
      const res = await fetch("/api/tracker", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ action, ...input, ...(logRequestId ? { requestId: logRequestId } : {}) }) });
      const next = await res.json().catch(() => ({ error: "Unable to save. Refresh the page and try again." }));
      if (!active.current || generation !== epoch.current) return false;
      if (!res.ok) { rejected = res.status < 500; throw new Error(next.error || "Unable to save. Try again."); }
      epoch.current += 1;
      apply(next as TrackerState);
      if (signature) retryIds.current.delete(signature);
      announceChange(action);
      return next as TrackerState;
    } catch (cause) {
      if (!active.current || generation !== epoch.current) return false;
      const timeoutMessage = action === "log" ? "The tracker took too long to respond. Try again; the same check-in won’t be added twice."
        : action === "settings" ? "The tracker took too long to respond. Reload your saved choices to check whether your changes were saved."
        : action === "register" || action === "login" ? "The tracker took too long to respond. Try logging in again."
        : "The tracker took too long to respond. Refresh your tracker and try again.";
      const message = controller.signal.aborted ? timeoutMessage : cause instanceof Error ? cause.message : "Unable to save. Check your connection and try again.";
      if (logRequestId) {
        if (rejected) retryIds.current.delete(signature);
        else uncertainLogs.current.set(logRequestId,message);
      }
      if (active.current) {
        setError(message);
        if (!navigator.onLine) setSyncStatus("offline");
      }
      // Reconcile an uncertain network result before the next interaction.
      queuedRefresh.current = true;
      return false;
    } finally {
      clearTimeout(timeout);
      if(mutationAbort.current === controller) mutationAbort.current = null;
      mutationActive.current = false;
      if (active.current) setPending(false);
      if (queuedRefresh.current) { queuedRefresh.current = false; void refresh(); }
    }
  }, [announceChange, apply, refresh]);

  useEffect(() => {
    active.current = true;
    void refresh();
    const changed = (notice: {type?:string;id?:string}) => {
      if (!notice || !["changed","auth-changed"].includes(notice.type ?? "") || !notice.id || seenNotices.current.has(notice.id)) return;
      seenNotices.current.add(notice.id);
      if(seenNotices.current.size > 30) seenNotices.current.delete(seenNotices.current.values().next().value!);
      if(notice.type === "auth-changed") {
        epoch.current += 1; getAbort.current?.abort(); mutationAbort.current?.abort();
        currentUser.current = undefined; revision.current = undefined; connectionLive.current = false; hasSnapshot.current = false;
        retryIds.current.clear(); uncertainLogs.current.clear(); setRecoveredLog(null);
        setData(EMPTY); setAvailable(false); setLoaded(false); setError(""); setSyncStatus("connecting");
      }
      void refresh();
    };
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("ashtray-sync-v1");
      channel.current.onmessage = event => changed(event.data);
    }
    const storage = (event: StorageEvent) => { if (event.key === "ashtray:changed" && event.newValue) { try { changed(JSON.parse(event.newValue)); } catch { /* Ignore unrelated local storage. */ } } };
    const online = () => { setSyncStatus("connecting"); void refresh(); };
    const offline = () => { connectionLive.current = false; setSyncStatus("offline"); };
    const focus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("storage", storage); window.addEventListener("online", online); window.addEventListener("offline", offline); window.addEventListener("focus", focus);
    return () => { active.current = false; getAbort.current?.abort(); mutationAbort.current?.abort(); channel.current?.close(); channel.current = null;
      window.removeEventListener("storage", storage); window.removeEventListener("online", online); window.removeEventListener("offline", offline); window.removeEventListener("focus", focus); };
  }, [refresh]);

  useEffect(() => {
    const userId = data.user?.id;
    if (!userId) { connectionLive.current = false; return; }
    let source: EventSource | null = null;
    let disposed = false;
    function connect() {
      if (disposed || document.visibilityState !== "visible" || !navigator.onLine || currentUser.current !== userId) return;
      source?.close();
      setSyncStatus("connecting");
      const instance = new EventSource("/api/sync");
      source = instance;
      const isCurrent = () => !disposed && source === instance && currentUser.current === userId;
      instance.onopen = () => { if(!isCurrent())return; connectionLive.current = true; setSyncStatus("live"); };
      instance.addEventListener("revision", event => {
        if (!isCurrent()) return;
        connectionLive.current = true; setSyncStatus("live");
        try { const incoming = JSON.parse((event as MessageEvent).data) as { revision: string }; if (incoming.revision !== revision.current) void refresh(); }
        catch { void refresh(); }
      });
      instance.addEventListener("auth", () => { instance.close(); if(!isCurrent())return; connectionLive.current = false; void refresh(); });
      instance.onerror = () => { if(!isCurrent())return; connectionLive.current = false; setSyncStatus(navigator.onLine ? "reconnecting" : "offline"); };
    }
    const wake = () => { if (document.visibilityState === "visible") { void refresh(); connect(); } else { source?.close(); source = null; connectionLive.current = false; setSyncStatus("paused"); } };
    const online = () => { void refresh(); connect(); };
    const offline = () => { source?.close(); source = null; connectionLive.current = false; setSyncStatus("offline"); };
    connect();
    const fallback = setInterval(() => { if (!disposed && document.visibilityState === "visible" && navigator.onLine && (!connectionLive.current || Date.now()-lastSuccessful.current>60_000)) void refresh(); }, 15_000);
    document.addEventListener("visibilitychange", wake); window.addEventListener("online", online); window.addEventListener("offline", offline);
    return () => { disposed = true; source?.close(); connectionLive.current = false; clearInterval(fallback); document.removeEventListener("visibilitychange", wake); window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, [data.user?.id, refresh]);

  return { data, loaded, available, pending, error, setError, refresh, mutate, syncStatus, lastSyncedAt, recoveredLog };
}
