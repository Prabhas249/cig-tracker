import { createHash } from "node:crypto";
import { type NextRequest } from "next/server";
import { getTrackerStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const runtimeState = globalThis as typeof globalThis & { __ashtraySyncConnections?: Map<string, number> };
const connections = runtimeState.__ashtraySyncConnections ??= new Map<string, number>();
const POLL_MS = 2000;
const HEARTBEAT_MS = 15000;
const STREAM_LIFETIME_MS = process.env.VERCEL === "1" ? 55_000 : 0;

function error(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: {
    "Cache-Control": "no-store, private", "Vary": "Cookie", "X-Content-Type-Options": "nosniff",
    ...(status === 429 ? { "Retry-After": "5" } : {}),
  } });
}

/** Invalidations only: all actual data still passes /api/tracker authorization. */
export async function GET(request: NextRequest): Promise<Response> {
  const startedAt = Date.now();
  const origin = request.headers.get("origin");
  const host = request.headers.get("host") ?? new URL(request.url).host;
  let expectedOrigin = "";
  try { expectedOrigin = new URL(`${request.nextUrl.protocol}//${host}`).origin; } catch { /* reject below */ }
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== expectedOrigin)) {
    return error("Open sync from the tracker.", 403);
  }
  const token = request.cookies.get("ashtray_session")?.value;
  let initialRevision: string | null;
  let store: Awaited<ReturnType<typeof getTrackerStore>>;
  try { store = await getTrackerStore(); initialRevision = await store.syncRevision(token); }
  catch { return error("Sync is temporarily unavailable. Please reconnect.", 503); }
  if (!initialRevision || !token) return error("Sign in to sync your tracker.", 401);

  const key = createHash("sha256").update(token).digest("hex");
  const total = [...connections.values()].reduce((sum, count) => sum + count, 0);
  if ((connections.get(key) ?? 0) >= 8 || total >= 128) return error("Too many sync connections. Close an unused tracker tab and try again.", 429);
  connections.set(key, (connections.get(key) ?? 0) + 1);

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lifetime: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let release: () => void = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let lastRevision = initialRevision;
      let lastHeartbeat = Date.now();
      release = () => {
        if (closed) return;
        closed = true;
        if (timer) clearTimeout(timer);
        if (lifetime) clearTimeout(lifetime);
        request.signal.removeEventListener("abort", release);
        const count = (connections.get(key) ?? 1) - 1;
        if (count <= 0) connections.delete(key); else connections.set(key, count);
        try { controller.close(); } catch { /* already cancelled */ }
      };
      request.signal.addEventListener("abort", release, { once: true });
      if (request.signal.aborted) { release(); return; }

      const send = (event: string, data: unknown, revision?: string) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`${revision ? `id: ${revision}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      // Do not replay a caller-provided Last-Event-ID. A fresh auth check and
      // current revision always restart this account's stream safely.
      controller.enqueue(encoder.encode("retry: 4000\n\n"));
      send("revision", { revision: initialRevision }, initialRevision);
      const poll = async () => {
        if (closed) return;
        try {
          const revision = await store.syncRevision(token);
          if (closed) return;
          if (!revision) {
            send("auth", { authenticated: false });
            release();
            return;
          }
          // A stalled client gets only the latest invalidation, never an
          // unbounded queue of events or heartbeat frames.
          if ((controller.desiredSize ?? 0) > 0 && revision !== lastRevision) {
            send("revision", { revision }, revision);
            lastRevision = revision;
            lastHeartbeat = Date.now();
          } else if ((controller.desiredSize ?? 0) > 0 && Date.now() - lastHeartbeat >= HEARTBEAT_MS) {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
            lastHeartbeat = Date.now();
          }
        } catch {
          // EventSource reconnects using the retry interval. No storage details
          // or private data are ever emitted as stream error payloads.
          release();
        } finally {
          if (!closed) { timer = setTimeout(poll, POLL_MS); timer.unref?.(); }
        }
      };
      timer = setTimeout(poll, POLL_MS);
      timer.unref?.();
      if (STREAM_LIFETIME_MS) { lifetime = setTimeout(release, Math.max(0, STREAM_LIFETIME_MS - (Date.now() - startedAt))); lifetime.unref?.(); }
    },
    cancel() { release(); },
  });

  return new Response(stream, { headers: {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-store, private, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Vary": "Cookie",
  } });
}
