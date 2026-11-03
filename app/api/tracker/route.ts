import { type NextRequest, NextResponse } from "next/server";
import { getTrackerStore, StoreError } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const SESSION_COOKIE = "ashtray_session";
const MAX_BODY_BYTES = 32 * 1024;

function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: {
    "Cache-Control": "no-store, private",
    "Vary": "Cookie",
    "X-Content-Type-Options": "nosniff",
  } });
}

function failure(error: unknown): NextResponse {
  if (error instanceof StoreError) {
    const response = json({ error: error.message }, error.status);
    if (error.status === 429) response.headers.set("Retry-After", "900");
    return response;
  }
  console.error("Tracker storage request failed.");
  return json({ error: "Could not save your changes. Please try again." }, 500);
}

async function readBody(request: NextRequest): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) throw new StoreError("That request is empty.");
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new StoreError("That request is too large.", 413);
      }
      body += decoder.decode(value, { stream: true });
    }
    return body + decoder.decode();
  } finally { reader.releaseLock(); }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try { return json(await (await getTrackerStore()).state(request.cookies.get(SESSION_COOKIE)?.value)); }
  catch (error) { return failure(error); }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // JSON requests plus an exact Origin check protect every cookie-authenticated mutation.
    const origin = request.headers.get("origin");
    // Next may build nextUrl with the server's bind hostname (or normalize a
    // loopback IP to localhost). Host preserves the address used by a LAN friend.
    const host = request.headers.get("host") ?? new URL(request.url).host;
    let expectedOrigin = "";
    try { expectedOrigin = new URL(`${request.nextUrl.protocol}//${host}`).origin; } catch { /* reject below */ }
    if (!origin || origin !== expectedOrigin || request.headers.get("sec-fetch-site") === "cross-site") {
      throw new StoreError("This request must come from the tracker. Refresh the page and try again.", 403);
    }
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
      throw new StoreError("Send this request as JSON.", 415);
    }
    if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) throw new StoreError("That request is too large.", 413);
    const body = await readBody(request);
    let input: unknown;
    try { input = JSON.parse(body); } catch { throw new StoreError("That request contains invalid JSON."); }
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new StoreError("Choose a valid action.");
    const result = await (await getTrackerStore()).mutate(input as Record<string, unknown>, request.cookies.get(SESSION_COOKIE)?.value);
    const response = json(result.state);
    if (result.sessionToken || result.clearSession) {
      response.cookies.set(SESSION_COOKIE, result.sessionToken ?? "", {
        httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/",
        maxAge: result.clearSession ? 0 : 14 * 24 * 60 * 60,
      });
    }
    return response;
  } catch (error) { return failure(error); }
}
