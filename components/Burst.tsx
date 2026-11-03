"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { ProductDef } from "@/lib/catalog";
import { getStickerSurface, getStickerTip, StickerObject } from "./StickerObject";
import "./burst.css";

/** The tapped artwork's getBoundingClientRect(), in viewport CSS pixels. */
export type BurstOrigin = { x: number; y: number; width: number; height: number };
type BurstProps = { product: ProductDef | null; nonce: number; origin?: BurstOrigin; onComplete?: () => void };
type BurstLayout = { nonce: number; x: number; y: number; fromX: number; fromY: number; sourceScale: number; sceneScale: number; smokeScale: number; returnsToSource: boolean; sourceWidth: number; sourceBottom: number };
const CIGARETTE_DURATION = 2080;
const DRINK_DURATION = 1640;

// Deterministic fragments: a crumbling cap, not a celebratory particle spray.
const ASH = [
  { x: -5, y: 92, delay: 760, size: 2.5, turn: -108 },
  { x: 9, y: 116, delay: 875, size: 3, turn: 154 },
  { x: -12, y: 106, delay: 940, size: 2, turn: -184 },
  { x: 7, y: 122, delay: 1040, size: 6, turn: 118 },
  { x: -15, y: 98, delay: 1105, size: 2.5, turn: -148 },
  { x: 15, y: 112, delay: 1160, size: 2, turn: 192 },
];
const WISPS = [
  { x: -14, delay: 540, width: 31, height: 86, path: "M24 99C9 85 38 77 24 60S11 39 24 22S29 8 23 1" },
  { x: 16, delay: 680, width: 35, height: 98, path: "M24 99C38 83 9 74 25 58S38 34 25 19S20 7 25 1" },
  { x: -8, delay: 810, width: 27, height: 92, path: "M24 99C11 82 33 73 24 56S13 36 24 20S28 7 24 1" },
  { x: 20, delay: 935, width: 33, height: 103, path: "M24 99C37 85 12 73 24 56S39 35 25 18S21 7 25 1" },
];

function clamp(value: number, low: number, high: number) {
  return Math.min(Math.max(value, low), Math.max(low, high));
}
function layoutFor(origin: BurstOrigin | undefined, tipY: number, productId: string, nonce: number): BurstLayout {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const validOrigin = origin && [origin.x, origin.y, origin.width, origin.height].every(Number.isFinite)
    && origin.width > 0 && origin.height > 0
    && origin.x + origin.width / 2 >= 0 && origin.x + origin.width / 2 <= width
    && origin.y + origin.height / 2 >= 0 && origin.y + origin.height / 2 <= height;
  const fromX = validOrigin ? origin.x + origin.width / 2 : width / 2;
  const fromY = validOrigin ? origin.y + origin.height / 2 : height * .6;
  const sceneScale = clamp(Math.min((height - 40) / 360, (width - 40) / 220), .5, 1);
  // Keep the physical echo and its detached fragments inside small viewports.
  const x = clamp(fromX, 74 * sceneScale, width - 74 * sceneScale);
  const y = clamp(fromY - 100 * sceneScale, 145 * sceneScale, height - 145 * sceneScale);
  const sourceScale = validOrigin ? clamp(Math.min(origin.width / 120, origin.height / 180), .18, 1) : .64;
  const smokeScale = clamp((y - 90 * sceneScale + tipY * 1.8 * sceneScale - 14) / (145 * sceneScale), .3, 1);
  // A closed sheet must not pull the object back toward a place that no longer
  // exists. Return only to the same visible artwork at the measured position.
  const hit = validOrigin ? document.elementFromPoint(clamp(fromX, 0, width - 1), clamp(fromY, 0, height - 1)) : null;
  const returnsToSource = !!validOrigin && hit?.closest("[data-product-id]")?.getAttribute("data-product-id") === productId
    && [...document.querySelectorAll<HTMLElement>("[data-sticker-object]")].some(element => {
      if (element.closest("[data-product-id]")?.getAttribute("data-product-id") !== productId) return false;
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= height && rect.left >= 0 && rect.right <= width
        && Math.abs(rect.x - origin.x) < 12 && Math.abs(rect.y - origin.y) < 12
        && Math.abs(rect.width - origin.width) < 12 && Math.abs(rect.height - origin.height) < 12;
    });
  return { nonce, x, y, fromX: fromX - x, fromY: fromY - y, sourceScale, sceneScale, smokeScale, returnsToSource,
    sourceWidth: validOrigin ? origin.width : 60, sourceBottom: validOrigin ? origin.y + origin.height * .94 : fromY + 40 };
}

function CigaretteEffects({ product, detached = false }: { product: ProductDef; detached?: boolean }) {
  const tip = getStickerTip(product);
  return (
    <span className="ash-log-burst-tip-anchor" style={{
      left: `${tip.x}%`, top: `${tip.y}%`, "--tip-turn": `${tip.rotation}deg`,
    } as CSSProperties}>
      {!detached && <><span className="ash-log-burst-ember" /><span className="ash-log-burst-cap" /></>}
      {detached && <><span className="ash-log-burst-smoke-origin">
        {WISPS.map((wisp, index) => <svg key={index} className="ash-log-burst-wisp" viewBox="0 0 48 100" preserveAspectRatio="none" fill="none" style={{
          width: wisp.width, height: wisp.height, marginInlineStart: -wisp.width / 2,
          animationDelay: `${wisp.delay}ms`, "--smoke-drift": `${wisp.x}px`,
        } as CSSProperties}>
          <path d={wisp.path} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <path d={wisp.path} stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity=".12" />
        </svg>)}
      </span>
      <span className="ash-log-burst-ash-origin">
        {ASH.map((flake, index) => <span key={index} className="ash-log-burst-flake" style={{
          width: flake.size, height: flake.size * .65, animationDelay: `${flake.delay}ms`,
          "--ash-x": `${flake.x}px`, "--ash-x-mid": `${flake.x * .5}px`,
          "--ash-y-early": `${flake.y * .1}px`, "--ash-y-mid": `${flake.y * .45}px`, "--ash-y": `${flake.y}px`, "--ash-turn": `${flake.turn}deg`,
        } as CSSProperties} />)}
      </span></>}
    </span>
  );
}
function DrinkEffects({ product }: { product: ProductDef }) {
  const wine = product.artKey === "wine";
  const beer = product.artKey === "beer";
  const surface = getStickerSurface(product);
  const closedVessel = surface.vessel === "bottle" || surface.vessel === "can";
  return (
    <span className={`ash-log-burst-drink-detail${wine ? " is-wine" : beer ? " is-beer" : ""}${closedVessel ? " is-closed" : ""}`} data-vessel={surface.vessel}>
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
  const [interrupted, setInterrupted] = useState(false);
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
    setInterrupted(false);
    setLayout(layoutFor(origin, tipY, productId, nonce));
    const timer = window.setTimeout(finish, duration + 30);
    let interruptTimer: number | undefined;
    const interrupt = () => {
      if (finished || interruptTimer !== undefined) return;
      setInterrupted(true);
      interruptTimer = window.setTimeout(finish, 140);
    };
    const preferenceChanged = () => { if (preference.matches) finish(); };
    preference.addEventListener("change", preferenceChanged);
    window.addEventListener("scroll", interrupt, { passive: true, capture: true });
    window.addEventListener("resize", interrupt, { passive: true });
    window.visualViewport?.addEventListener("resize", interrupt, { passive: true });
    return () => {
      finished = true;
      window.clearTimeout(timer);
      if (interruptTimer !== undefined) window.clearTimeout(interruptTimer);
      preference.removeEventListener("change", preferenceChanged);
      window.removeEventListener("scroll", interrupt, true);
      window.removeEventListener("resize", interrupt);
      window.visualViewport?.removeEventListener("resize", interrupt);
    };
    // Each saved nonce owns one frozen origin and one completion callback.
  }, [productId, nonce, duration, tipY, origin?.x, origin?.y, origin?.width, origin?.height]);

  if (!product || !nonce || !layout || layout.nonce !== nonce) return null;
  const direction = layout.fromX < 0 ? -1 : 1;
  const style = {
    "--burst-x": `${layout.x}px`, "--burst-y": `${layout.y}px`,
    "--burst-from-x": `${layout.fromX}px`, "--burst-from-y": `${layout.fromY}px`,
    "--burst-from-scale": layout.sourceScale, "--burst-scene-scale": layout.sceneScale,
    "--burst-lift-x": `${layout.fromX * .42 + direction * 13}px`, "--burst-lift-y": `${layout.fromY * .28 - 18}px`,
    "--burst-return-x": `${layout.fromX * .5 - direction * 8}px`, "--burst-return-y": `${layout.fromY * .42 - 10}px`,
    "--burst-smoke-scale": layout.smokeScale, "--burst-duration": `${duration}ms`,
    "--burst-source-width": `${layout.sourceWidth * .65}px`, "--burst-source-bottom": `${layout.sourceBottom}px`,
  } as CSSProperties;
  return createPortal(
    <div className={`ash-log-burst-overlay${interrupted ? " is-interrupted" : ""}`} aria-hidden="true" style={style}>
      {layout.returnsToSource && <span key={`contact-${nonce}`} className="ash-log-burst-contact" />}
      <div key={nonce} className={`ash-log-burst-stage ${cigarette ? "is-cigarette" : "is-drink"} ${layout.returnsToSource ? "returns-to-source" : "fades-in-place"}`} data-product={product.id}>
        <div className="ash-log-burst-flight"><div className="ash-log-burst-object">
          <StickerObject product={product} size="lg" lit={cigarette} className="ash-log-burst-art" />
          {cigarette ? <CigaretteEffects product={product} /> : <DrinkEffects product={product} />}
        </div></div>
        {cigarette && <div className="ash-log-burst-air" data-detached-effects=""><CigaretteEffects product={product} detached/></div>}
      </div>
    </div>, document.body,
  );
}
