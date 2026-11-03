import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/Geist-Variable.woff2",
  variable: "--font-geist-sans-loaded",
  weight: "100 900",
  style: "normal",
  display: "swap",
  fallback: ["Arial", "Helvetica", "sans-serif"],
});

const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono-loaded",
  weight: "100 900",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "monospace"],
});

export const metadata: Metadata = {
  title: "Ashtray",
  description: "Your cigarette and drink tracker. One tap, a private ledger, and friends in your circle.",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}><body>{children}</body></html>;
}
