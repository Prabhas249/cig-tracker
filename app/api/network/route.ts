import { networkInterfaces } from "node:os";
import { NextRequest, NextResponse } from "next/server";
import { getTrackerStore } from "@/lib/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  if (!(await (await getTrackerStore()).state(request.cookies.get("ashtray_session")?.value)).user) return NextResponse.json({ error: "Log in first." }, { status: 401 });
  if (process.env.VERCEL === "1") return NextResponse.json({ networkUrl: request.nextUrl.origin }, { headers: { "Cache-Control": "no-store, private" } });
  const interfaces = Object.entries(networkInterfaces()).sort(([a], [b]) => (a === "en0" ? -1 : b === "en0" ? 1 : 0));
  const address = interfaces.flatMap(([, rows]) => rows ?? []).find(n => n.family === "IPv4" && !n.internal && /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(n.address))?.address;
  const port = request.headers.get("host")?.match(/:(\d+)$/)?.[1] ?? "3000";
  return NextResponse.json({ networkUrl: address ? `http://${address}:${port}` : null }, { headers: { "Cache-Control": "no-store, private" } });
}
