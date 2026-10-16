import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";
const localAddresses = Object.values(networkInterfaces()).flatMap(rows => rows ?? []).filter(n => n.family === "IPv4" && !n.internal).map(n => n.address);
const nextConfig: NextConfig = { devIndicators: false, allowedDevOrigins: localAddresses };
export default nextConfig;
