import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

// A deliberately small hook harness: real asynchronous fetch/abort semantics,
// batched state renders and effect cleanup, with no DOM or extra dependencies.
// It executes the actual hook source, not a copied implementation.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = await mkdtemp(join(tmpdir(), "ashtray-sync-client-"));
const shim = `
const current = () => globalThis.__ashtrayHookHarness;
const same = (a,b) => a && b && a.length===b.length && a.every((v,i)=>Object.is(v,b[i]));
export function useState(initial) {
  const h=current(), i=h.cursor++;
  const slot=h.slots[i] ??= {kind:'state',value:typeof initial==='function'?initial():initial};
  if(!slot.set)slot.set=next=>{const value=typeof next==='function'?next(slot.value):next;if(!Object.is(value,slot.value)){slot.value=value;h.schedule();}};
  return [slot.value,slot.set];
}
export function useRef(initial){const h=current(),i=h.cursor++;return (h.slots[i]??={kind:'ref',value:{current:initial}}).value;}
export function useCallback(fn,deps){const h=current(),i=h.cursor++,s=h.slots[i];if(s&&same(s.deps,deps))return s.value;h.slots[i]={kind:'callback',deps,value:fn};return fn;}
export function useEffect(effect,deps){const h=current(),i=h.cursor++,slot=h.slots[i]??={kind:'effect',deps:undefined,cleanup:undefined};if(!same(slot.deps,deps)){h.effects.push(()=>{slot.cleanup?.();slot.deps=deps;slot.cleanup=effect();});}}
`;

class Harness {
  constructor(hook) { this.hook = hook; this.slots = []; this.cursor = 0; this.effects = []; this.mounted = true; this.queued = false; }
  render() {
    if (!this.mounted) return;
    this.cursor = 0; this.effects = [];
    globalThis.__ashtrayHookHarness = this;
    try { this.value = this.hook(); } finally { delete globalThis.__ashtrayHookHarness; }
    for (const effect of this.effects) effect();
  }
  schedule() {
    if (!this.mounted || this.queued) return;
    this.queued = true;
    queueMicrotask(() => { this.queued = false; this.render(); });
  }
  unmount() {
    this.mounted = false;
    for (const slot of this.slots) if (slot?.kind === "effect") slot.cleanup?.();
  }
}

const flush = async () => { for (let index = 0; index < 4; index++) await new Promise(resolve => setImmediate(resolve)); };
const globals = ["fetch", "window", "document", "navigator", "EventSource", "BroadcastChannel", "localStorage"];
const originals = new Map(globals.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));

function environment() {
  const requests = [];
  const sources = [];
  const channels = [];
  const window = new EventTarget();
  const document = new EventTarget(); document.visibilityState = "visible";
  class Source {
    constructor(url) { this.url = url; this.closed = false; this.closeCount = 0; this.listeners = new Map(); sources.push(this); }
    addEventListener(type, callback) { const list = this.listeners.get(type) ?? []; list.push(callback); this.listeners.set(type, list); }
    close() { this.closed = true; this.closeCount++; }
    emit(type, data) {
      // Preserve callbacks after close to reproduce already-queued browser tasks.
      const event = { data: typeof data === "string" ? data : JSON.stringify(data) };
      if (type === "open") this.onopen?.(event);
      else if (type === "error") this.onerror?.(event);
      for (const callback of this.listeners.get(type) ?? []) callback(event);
    }
  }
  class Channel {
    constructor(name) { this.name = name; this.messages = []; this.closed = false; channels.push(this); }
    postMessage(message) { this.messages.push(message); }
    close() { this.closed = true; }
    receive(message) { this.onmessage?.({ data: message }); }
  }
  const fetch = (url, options = {}) => new Promise((resolve, reject) => {
    const request = { url, options, method: options.method ?? "GET", settled: false, taken: false, ignoreAbort: false };
    request.body = options.body ? JSON.parse(options.body) : undefined;
    request.resolve = (body, status = 200) => { if (request.settled) return; request.settled = true; resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })); };
    request.reject = cause => { if (request.settled) return; request.settled = true; reject(cause); };
    const abort = () => { if (!request.ignoreAbort) request.reject(new DOMException("Aborted", "AbortError")); };
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    requests.push(request);
  });
  const values = { fetch, window, document, navigator: { onLine: true }, EventSource: Source, BroadcastChannel: Channel, localStorage: { setItem() {} } };
  for (const [name, value] of Object.entries(values)) Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  return {
    requests, sources, channels, window, document,
    take(method = "GET") {
      const request = requests.find(request => request.method === method && !request.taken);
      assert.ok(request, `Expected a ${method} request`); request.taken = true; return request;
    },
    visibility(state) { document.visibilityState = state; document.dispatchEvent(new Event("visibilitychange")); },
    auth(message) { channels[0].receive(message); },
    storage(message) { const event = new Event("storage"); Object.assign(event, { key: "ashtray:changed", newValue: JSON.stringify(message) }); window.dispatchEvent(event); },
    async stop(harness) {
      harness.unmount();
      for (const request of requests) request.reject(new DOMException("Test cleanup", "AbortError"));
      await flush();
    },
  };
}

function snapshot(id = "alice", events = [], revision = `${id}-0`) {
  return { user: { id, name: id, username: id, inviteCode: "ASH-TEST", timezone: "Asia/Kolkata", city: "", cigBaseline: 8, drinkBaseline: 2, dailyLimit: 8, defaultPrice: 25, sharing: "summary", favoriteIds: [], priceOverrides: {}, createdAt: new Date().toISOString() }, events, friends: [], requests: [], sentRequests: [], revision };
}
function event(id, requestId) { return { id, requestId, productName: "Marlboro Red", kind: "cig", quantity: 1, unitCostInr: 25, loggedAt: new Date().toISOString() }; }
const logInput = { productId: "marlboro-red", quantity: 1, unitCostInr: 25, source: "shelf" };

let hook;
async function boot() {
  const env = environment();
  const harness = new Harness(hook);
  harness.render();
  env.take().resolve(snapshot());
  await flush();
  assert.equal(harness.value.data.user.id, "alice");
  assert.equal(env.sources.length, 1);
  env.sources[0].emit("open");
  await flush();
  return { env, harness };
}

try {
  await writeFile(join(temp, "react-shim.mjs"), shim);
  const source = await readFile(join(root, "lib", "use-tracker-state.ts"), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace('from "react"', 'from "./react-shim.mjs"');
  await writeFile(join(temp, "hook.mjs"), output);
  ({ useTrackerState: hook } = await import(pathToFileURL(join(temp, "hook.mjs"))));

  {
    const { env, harness } = await boot();
    try {
      env.sources[0].emit("revision", { revision: "alice-other" });
      const stale = env.take(); stale.ignoreAbort = true;
      const saving = harness.value.mutate("log", logInput);
      const post = env.take("POST");
      post.resolve(snapshot("alice", [event("saved", post.body.requestId)], "alice-saved"));
      await saving; await flush();
      stale.resolve(snapshot("alice", [], "alice-old"));
      await flush();
      assert.equal(harness.value.data.events[0].id, "saved", "A late GET cannot replace a successful mutation");
      assert.equal(harness.value.data.revision, "alice-saved");
      console.log("PASS: delayed GET cannot clobber a saved mutation.");
    } finally { await env.stop(harness); }
  }

  {
    const { env, harness } = await boot();
    try {
      const saving = harness.value.mutate("log", logInput);
      const post = env.take("POST");
      const firstId = post.body.requestId;
      post.reject(new TypeError("Failed to fetch"));
      assert.equal(await saving, false);
      await flush();
      assert.ok(harness.value.error, "An uncertain save initially reports its network error");
      env.take().resolve(snapshot("alice", [event("recovered", firstId)], "alice-recovered"));
      await flush();
      assert.equal(harness.value.error, "", "A reconciled save clears its exact uncertain error");
      assert.equal(harness.value.recoveredLog.id, "recovered");
      assert.equal(harness.value.recoveredLog.name, "Marlboro Red");
      const nextSave = harness.value.mutate("log", logInput);
      const next = env.take("POST");
      assert.notEqual(next.body.requestId, firstId, "After recovered success, a deliberate new tap has a fresh request ID");
      next.resolve(snapshot("alice", [event("new", next.body.requestId), event("recovered", firstId)], "alice-next"));
      await nextSave; await flush();
      assert.equal(harness.value.data.events.length, 2);
      console.log("PASS: uncertain success clears the retry error and signals recovered success.");
    } finally { await env.stop(harness); }
  }

  {
    const { env, harness } = await boot();
    try {
      const saving = harness.value.mutate("log", logInput);
      const post = env.take("POST");
      const uncertainId = post.body.requestId;
      post.reject(new TypeError("Failed to fetch"));
      await saving; await flush();
      env.take().resolve(snapshot());
      await flush();
      assert.equal(harness.value.recoveredLog, null);
      const retrying = harness.value.mutate("log", logInput);
      const retry = env.take("POST");
      assert.equal(retry.body.requestId, uncertainId, "Unconfirmed network failures retain the same idempotency key");
      retry.resolve(snapshot("alice", [event("retried-once", uncertainId)], "alice-retried"));
      await retrying; await flush();
      assert.equal(harness.value.data.events.length, 1);
      console.log("PASS: an unconfirmed retry reuses its original idempotency key.");
    } finally { await env.stop(harness); }
  }

  {
    const { env, harness } = await boot();
    try {
      const old = env.sources[0];
      env.visibility("hidden"); await flush();
      assert.equal(old.closed, true);
      env.visibility("visible"); await flush();
      const current = env.sources.at(-1);
      assert.notEqual(current, old);
      current.emit("open"); await flush();
      const closes = current.closeCount;
      const requests = env.requests.length;
      old.emit("auth", { authenticated: false }); old.emit("error"); old.emit("open"); old.emit("revision", { revision: "stale" });
      await flush();
      assert.equal(current.closed, false, "A stale source callback cannot close the replacement stream");
      assert.equal(current.closeCount, closes);
      assert.equal(env.requests.length, requests, "A stale source cannot trigger a new account refresh");
      assert.equal(harness.value.syncStatus, "live");
      console.log("PASS: stale EventSource callbacks cannot affect its replacement.");
    } finally { await env.stop(harness); }
  }

  {
    const { env, harness } = await boot();
    try {
      const saving = harness.value.mutate("log", logInput);
      const post = env.take("POST"); post.ignoreAbort = true;
      const notice = { type: "auth-changed", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" };
      env.auth(notice); env.storage(notice);
      await flush();
      assert.equal(post.options.signal.aborted, true, "An external auth change aborts the old request");
      assert.equal(harness.value.data.user, null, "The old account's snapshot disappears immediately");
      assert.equal(harness.value.available, false);
      post.resolve(snapshot("alice", [event("late-alice", post.body.requestId)], "alice-late"));
      assert.equal(await saving, false, "A late old-account POST cannot be applied");
      await flush();
      assert.equal(harness.value.data.user, null);
      const refresh = env.take();
      assert.equal(env.requests.filter(request => request.method === "GET").length, 2, "Broadcast/storage copies of one auth event cause one refresh");
      refresh.resolve(snapshot("bob", [], "bob-new"));
      await flush();
      assert.equal(harness.value.data.user.id, "bob");
      assert.equal(harness.value.data.events.length, 0);
      assert.equal(harness.value.error, "");
      assert.equal(harness.value.recoveredLog, null);
      console.log("PASS: auth changes suppress late POSTs and deduplicate broadcast/storage signals.");
    } finally { await env.stop(harness); }
  }
} finally {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
  }
  delete globalThis.__ashtrayHookHarness;
  await rm(temp, { recursive: true, force: true });
}
