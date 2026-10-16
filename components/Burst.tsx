"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { ProductDef } from "@/lib/catalog";
import { getStickerSurface, getStickerTip, StickerObject } from "./StickerObject";
import "./burst.css";

/** The tapped artwork's getBoundingClientRect(), in viewport CSS pixels. */
export type BurstOrigin = { x: number; y: number; width: number; height: number };
type BurstProps = { product: ProductDef | null; nonce: number; origin?: BurstOrigin; onComplete?: () => void };
type BurstLayout = { x: number; y: number; fromX: number; fromY: number; scale: number; smokeScale: number };
const CIGARETTE_DURATION = 2040;
const DRINK_DURATION = 1550;

// Deterministic fragments: a crumbling cap, not a celebratory particle spray.
const ASH = [
  { x: -5, y: 92, delay: 620, size: 2.5, turn: -108 },
  { x: 9, y: 116, delay: 735, size: 3, turn: 154 },
  { x: -12, y: 106, delay: 840, size: 2, turn: -184 },
  { x: 7, y: 122, delay: 960, size: 6, turn: 118 },
  { x: -15, y: 98, delay: 1005, size: 2.5, turn: -148 },
  { x: 15, y: 112, delay: 1090, size: 2, turn: 192 },
];
const WISPS = [
  { x: -14, delay: 150, width: 34, height: 90, path: "M24 99C9 85 38 77 24 60S11 39 24 22S29 8 23 1" },
  { x: 16, delay: 370, width: 39, height: 104, path: "M24 99C38 83 9 74 25 58S38 34 25 19S20 7 25 1" },
  { x: -8, delay: 600, width: 28, height: 92, path: "M24 99C11 82 33 73 24 56S13 36 24 20S28 7 24 1" },
  { x: 20, delay: 790, width: 35, height: 108, path: "M24 99C37 85 12 73 24 56S39 35 25 18S21 7 25 1" },
];

function clamp(value: number, low: number, high: number) {
  return Math.min(Math.max(value, low), Math.max(low, high));
}
function layoutFor(origin: BurstOrigin | undefined, tipY: number): BurstLayout {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const validOrigin = origin && [origin.x, origin.y, origin.width, origin.height].every(Number.isFinite)
    && origin.width > 0 && origin.height > 0;
  const fromX = validOrigin ? origin.x + origin.width / 2 : width / 2;
  const fromY = validOrigin ? origin.y + origin.height / 2 : height * .6;
  // Room for the curl above and falling ash below, including at 320px.
  const x = clamp(fromX, 78, width - 78);
  const y = clamp(fromY - 105, 160, height - 170);
  const scale = validOrigin ? clamp(Math.min(origin.width / 120, origin.height / 180), .18, 1) : .64;
  const smokeScale = clamp((y - 90 + tipY * 1.8 - 12) / 165, .3, 1);
  return { x, y, fromX: fromX - x, fromY: fromY - y, scale, smokeScale };
}

function CigaretteEffects({ product }: { product: ProductDef }) {
  const tip = getStickerTip(product);
  return (
    <span className="ash-log-burst-tip-anchor" style={{
      left: `${tip.x}%`, top: `${tip.y}%`, "--tip-turn": `${tip.rotation}deg`,
    } as CSSProperties}>
      <span className="ash-log-burst-ember" />
      <span className="ash-log-burst-cap" />
      <span className="ash-log-burst-smoke-origin">
        {WISPS.map((wisp, index) => <svg key={index} className="ash-log-burst-wisp" viewBox="0 0 48 100" fill="none" style={{
          width: wisp.width, height: wisp.height, marginInlineStart: -wisp.width / 2,
          animationDelay: `${wisp.delay}ms`, "--smoke-drift": `${wisp.x}px`,
        } as CSSProperties}>
          <path d={wisp.path} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d={wisp.path} stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity=".12" />
        </svg>)}
      </span>
      <span className="ash-log-burst-ash-origin">
        {ASH.map((flake, index) => <span key={index} className="ash-log-burst-flake" style={{
          width: flake.size, height: flake.size * .65, animationDelay: `${flake.delay}ms`,
          "--ash-x": `${flake.x}px`, "--ash-x-mid": `${flake.x * .5}px`,
          "--ash-y-mid": `${flake.y * .28}px`, "--ash-y": `${flake.y}px`, "--ash-turn": `${flake.turn}deg`,
        } as CSSProperties} />)}
      </span>
    </span>
  );
}
function DrinkEffects({ product }: { product: ProductDef }) {
  const wine = product.artKey === "wine";
  const beer = product.artKey === "beer";
  const surface = getStickerSurface(product);
  const closedVessel = surface.vessel === "bottle" || surface.vessel === "can";
  return (
    <span className={`ash-log-burst-drink-detail${wine ? " is-wine" : beer ? " is-beer" : ""}${closedVessel ? " is-closed" : ""}`}>
      <span className="ash-log-burst-glint" />
      {!closedVessel && <span className="ash-log-burst-liquid-surface" style={{left: `${surface.x}%`, top: `${surface.y}%`}}>
        <span className="ash-log-burst-ripple" />
        <span className="ash-log-burst-ripple is-second" />
        {surface.vessel === "beer" && <><span className="ash-log-burst-bubble" /><span className="ash-log-burst-bubble is-second" /></>}
      </span>}
    </span>
  );
}

/** A finite visual echo of a saved log. Persistent status belongs to the caller. */
export function Burst({ product, nonce, origin, onComplete }: BurstProps) {
  const [layout, setLayout] = useState<BurstLayout | null>(null);
  const callback = useRef(onComplete);
  useEffect(() => { callback.current = onComplete; }, [onComplete]);
  const productId = product?.id;
  const cigarette = product?.kind === "cig";
  const tipY = product ? getStickerTip(product).y : 16;
  const duration = cigarette ? CIGARETTE_DURATION : DRINK_DURATION;

  useEffect(() => {
    if (!productId || !nonce) { setLayout(null); return; }
    let finished = false;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finish = () => {
      if (finished) return;
      finished = true;
      setLayout(null);
      callback.current?.();
    };
    if (preference.matches) {
      const timer = window.setTimeout(finish, 0);
      return () => { finished = true; window.clearTimeout(timer); };
    }
    setLayout(layoutFor(origin, tipY));
    const timer = window.setTimeout(finish, duration + 30);
    const preferenceChanged = () => { if (preference.matches) finish(); };
    preference.addEventListener("change", preferenceChanged);
    return () => {
      finished = true;
      window.clearTimeout(timer);
      preference.removeEventListener("change", preferenceChanged);
    };
    // Each saved nonce owns one frozen origin and one completion callback.
  }, [productId, nonce, duration, tipY, origin?.x, origin?.y, origin?.width, origin?.height]);

  if (!product || !nonce || !layout) return null;
  const style = {
    "--burst-x": `${layout.x}px`, "--burst-y": `${layout.y}px`,
    "--burst-from-x": `${layout.fromX}px`, "--burst-from-y": `${layout.fromY}px`,
    "--burst-from-scale": layout.scale, "--burst-smoke-scale": layout.smokeScale, "--burst-duration": `${duration}ms`,
  } as CSSProperties;
  return createPortal(
    <div className="ash-log-burst-overlay" aria-hidden="true" style={style}>
      <span key={`landing-${nonce}`} className="ash-log-burst-landing" />
      <div key={nonce} className={`ash-log-burst-stage ${cigarette ? "is-cigarette" : "is-drink"}`} data-product={product.id}>
        <div className="ash-log-burst-object">
          <StickerObject product={product} size="lg" lit={cigarette} className="ash-log-burst-art" />
          {cigarette ? <CigaretteEffects product={product} /> : <DrinkEffects product={product} />}
        </div>
      </div>
    </div>, document.body,
  );
}
