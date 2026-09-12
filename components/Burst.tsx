"use client";

import { ART_SRC, type ProductDef } from "@/lib/catalog";

const WISPS = [
  { x: -22, d: 0, w: 16, h: 44 },
  { x: -8, d: 90, w: 22, h: 56 },
  { x: 6, d: 40, w: 18, h: 50 },
  { x: 18, d: 140, w: 24, h: 62 },
  { x: -16, d: 180, w: 20, h: 48 },
  { x: 10, d: 220, w: 28, h: 70 },
  { x: -4, d: 70, w: 14, h: 38 },
  { x: 26, d: 260, w: 18, h: 52 },
  { x: -28, d: 300, w: 20, h: 46 },
  { x: 2, d: 330, w: 26, h: 64 },
  { x: 14, d: 110, w: 12, h: 36 },
  { x: -12, d: 380, w: 22, h: 58 },
];

export function Burst({
  product,
  nonce,
}: {
  product: ProductDef | null;
  nonce: number;
}) {
  if (!product || !nonce) return null;
  const drink = product.kind === "drink";
  const src = drink ? ART_SRC[product.artKey] : ART_SRC.ember;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center pb-20" aria-hidden>
      <div key={nonce} className="relative h-80 w-52">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          className="absolute inset-x-0 bottom-0 mx-auto h-44 w-auto object-contain"
          style={{ animation: "burst-rise 1800ms cubic-bezier(0.2, 0, 0, 1) both", willChange: "transform, opacity, filter" }}
        />
        {!drink && (
          <>
            <span className="ember-glow absolute left-1/2 bottom-[9.5rem]" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/products/smoke-ribbon.png"
              alt=""
              className="absolute left-1/2 bottom-28 w-36 -translate-x-1/2 object-contain mix-blend-multiply"
              style={{ animation: "smoke-plume 2200ms ease-out both", willChange: "transform, opacity, filter" }}
            />
            {WISPS.map((w, i) => (
              <span
                key={i}
                className="smoke-blob absolute left-1/2 bottom-32"
                style={{
                  width: w.w,
                  height: w.h,
                  marginLeft: w.x,
                  animation: "smoke-wisp 2200ms ease-out both",
                  animationDelay: `${w.d}ms`,
                  ["--drift" as string]: `${w.x * 1.8}px`,
                  willChange: "transform, opacity, filter",
                }}
              />
            ))}
          </>
        )}
        {drink && (
          <>
            <span
              className="absolute left-1/2 bottom-16 h-24 w-1.5 origin-bottom rounded-full"
              style={{
                marginLeft: "-3px",
                background: "linear-gradient(180deg, oklch(0.72 0.12 70 / 0.1), oklch(0.62 0.14 55 / 0.85))",
                animation: "pour 900ms ease-out both",
                willChange: "transform, opacity",
              }}
            />
            <span
              className="absolute left-1/2 bottom-20 size-10 -translate-x-1/2 rounded-full"
              style={{
                background: "radial-gradient(circle, oklch(0.78 0.12 70 / 0.45), transparent 70%)",
                animation: "drink-ripple 1100ms ease-out both",
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
