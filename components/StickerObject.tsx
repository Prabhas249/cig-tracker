"use client";

import { useId, type CSSProperties } from "react";
import type { ProductDef } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import "./sticker-object.css";

export type StickerObjectProps = {
  product: ProductDef;
  size?: "sm" | "md" | "lg";
  lit?: boolean;
  className?: string;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function cigaretteTop(product: ProductDef) {
  return 168 - clamp(128 + ((product.lengthMm ?? 84) - 64) * .65, 124, 157);
}

/** Tip position in the 120 × 180 artwork, returned as percentages for overlays. */
export function getStickerTip(product: ProductDef) {
  const top = cigaretteTop(product);
  const angle = 12 * Math.PI / 180;
  return {
    x: ((60 - (top - 100) * Math.sin(angle)) / 120) * 100,
    y: ((100 + (top - 100) * Math.cos(angle)) / 180) * 100,
    rotation: 12,
  };
}

function vesselFor(product: ProductDef) {
  if (product.unitName === "bottle") return "bottle";
  if (product.unitName === "can") return "can";
  if (product.artKey === "wine") return "wine";
  if (product.artKey === "beer") return "beer";
  return "lowball";
}

function lowballSurface(product: ProductDef) {
  // A small measure occupies the bottom of a lowball; it is not a full glass.
  return 151 - clamp((product.volumeMl ?? 30) / 150, .2, .8) * 85;
}

/** Visible surface/mouth anchor for a caller's short, user-triggered liquid feedback. */
export function getStickerSurface(product: ProductDef) {
  const vessel = vesselFor(product);
  const y = vessel === "bottle" ? ((product.volumeMl ?? 650) <= 350 ? 30 : 18) : vessel === "can" ? 36 : vessel === "wine" ? 73 : vessel === "beer" ? 51 : lowballSurface(product);
  return { x: 50, y: y / 180 * 100, vessel };
}

function Cigarette({ product, lit, id }: { product: ProductDef; lit: boolean; id: string }) {
  const top = cigaretteTop(product);
  const filterStart = product.filter === false ? 168 : 130;
  const body = `M50.5 ${top} C50.5 ${top - 4.5} 69.5 ${top - 4.5} 69.5 ${top} V164 C69.5 170 50.5 170 50.5 164Z`;
  return <>
    <defs>
      <linearGradient id={`${id}-paper`} x1="50" y1="0" x2="70" y2="0" gradientUnits="userSpaceOnUse"><stop stopColor="#cecec6"/><stop offset=".18" stopColor="#f7f6ed"/><stop offset=".42" stopColor="#fffef6"/><stop offset=".76" stopColor="#ecebe3"/><stop offset="1" stopColor="#b9bbb3"/></linearGradient>
      <linearGradient id={`${id}-cork`} x1="50" y1="0" x2="70" y2="0" gradientUnits="userSpaceOnUse"><stop stopColor="#87552e"/><stop offset=".18" stopColor="#bb844c"/><stop offset=".46" stopColor="#ddb077"/><stop offset=".74" stopColor="#be8b51"/><stop offset="1" stopColor="#875b32"/></linearGradient>
      <linearGradient id={`${id}-gold`}><stop stopColor="#87703b"/><stop offset=".36" stopColor="#ead5a1"/><stop offset=".55" stopColor="#fff0b5"/><stop offset="1" stopColor="#98814b"/></linearGradient>
      <radialGradient id={`${id}-ember`}><stop stopColor="#fff6b6"/><stop offset=".3" stopColor="#ffb45c"/><stop offset=".65" stopColor="#e65d2d"/><stop offset="1" stopColor="#552f27"/></radialGradient>
      <pattern id={`${id}-paper-grain`} width="6" height="9" patternUnits="userSpaceOnUse"><path d="m.5 2 1-.5m2 4 1.5-.5M5 8l.5-.5" stroke="#85897d" strokeWidth=".35" opacity=".18"/><path d="M1 7.5 2 7M4 1.5 5 1" stroke="#fff" strokeWidth=".6" opacity=".5"/></pattern>
      <pattern id={`${id}-cork-grain`} width="8" height="9" patternUnits="userSpaceOnUse"><path d="m1 2 1.1-.4m3.2 5 1.5-.8M2 6l.5 1.2M7 1l-.6.5" stroke="#5e3b20" strokeWidth=".8" strokeLinecap="round" opacity=".36"/><path d="m4 2 .5 1M.2 8l1-.5M6 5l.8.3" stroke="#f6dab3" strokeWidth=".7" strokeLinecap="round" opacity=".7"/><circle cx="3" cy="4" r=".45" fill="#694221" opacity=".55"/></pattern>
      <pattern id={`${id}-tobacco`} width="5" height="4" patternUnits="userSpaceOnUse"><rect width="5" height="4" fill="#594027"/><path d="m.2 2 1.7-.7m.7 2L4 1" stroke="#bb8a4b" strokeWidth=".8"/><path d="m1 4 1-1m2-3 .8 1" stroke="#2f291c" strokeWidth=".8"/></pattern>
      <clipPath id={`${id}-cig-clip`}><path d={body}/></clipPath>
    </defs>
    <g transform="rotate(12 60 100)" className="sticker-object__cylinder">
      <path d={body} fill="#fff" stroke="#fff" strokeWidth="7" strokeLinejoin="round"/>
      <g clipPath={`url(#${id}-cig-clip)`}>
        <path d={body} fill={`url(#${id}-paper)`}/>
        <path d={body} fill={`url(#${id}-paper-grain)`}/>
        <path d={`M53.5 ${top + 6}v${filterStart - top - 10}`} stroke="#fff" strokeWidth="1.4" opacity=".6"/>
        <path d={`M68.2 ${top + 2}v${166 - top}`} stroke="#a6a99d" strokeWidth=".7" opacity=".35"/>
        {product.filter !== false && <><rect x="50" y={filterStart} width="20" height="40" fill={`url(#${id}-cork)`}/><rect x="50" y={filterStart} width="20" height="40" fill={`url(#${id}-cork-grain)`}/><rect x="50" y={filterStart} width="20" height="2.6" fill={`url(#${id}-gold)`}/><path d="M53 135v26" stroke="#f7d2a0" strokeWidth="1.1" opacity=".45"/><ellipse cx="60" cy="167" rx="9.5" ry="2.7" fill="#7e5934" opacity=".35"/></>}
      </g>
      <ellipse cx="60" cy={top} rx="9.5" ry="3.5" fill={lit ? "#53504a" : "#ded8c3"} stroke="#b6b6a9" strokeWidth=".7"/>
      <ellipse cx="60" cy={top - .25} rx="8.1" ry="2.7" fill={lit ? `url(#${id}-ember)` : `url(#${id}-tobacco)`}/>
      {lit && <g className="sticker-object__ember"><path d={`m53 ${top - 1} 2 1.5 1-1.8 2.5 2 2-2 2 1.3 3-1.1`} fill="none" stroke="#d4d0bc" strokeWidth="1.2"/><ellipse cx="60" cy={top} rx="5.5" ry="1.8" fill="#ffb06a" opacity=".35"/></g>}
      <path d={`M50.5 ${top}c0 4 19 4 19 0`} fill="none" stroke="#fffdf2" strokeWidth=".8" opacity=".8"/>
    </g>
  </>;
}

function VesselDefinitions({ product, id }: { product: ProductDef; id: string }) {
  const clear = product.artKey === "clear" && product.unitName !== "bottle";
  const whiteWine = /sauvignon|blanc|chardonnay|white|grigio/i.test(`${product.name} ${product.variant}`);
  const body = /^#[0-9a-f]{6}$/i.test(product.body) ? product.body.slice(1).match(/../g)!.map(value => parseInt(value, 16)) : [0, 0, 0];
  const greenGlass = body[1] > body[0] * 1.2 && body[1] > body[2] * 1.1;
  return <defs>
    <linearGradient id={`${id}-glass`} x1="0" y1=".3" x2="1" y2=".4"><stop stopColor="#899f94" stopOpacity=".92"/><stop offset=".07" stopColor="#fff" stopOpacity=".98"/><stop offset=".15" stopColor="#cbd9cf" stopOpacity=".6"/><stop offset=".3" stopColor="#f4f8f2" stopOpacity=".08"/><stop offset=".57" stopColor="#d7e3da" stopOpacity=".16"/><stop offset=".78" stopColor="#fff" stopOpacity=".2"/><stop offset=".91" stopColor="#9db4a6" stopOpacity=".66"/><stop offset=".96" stopColor="#fff" stopOpacity=".94"/><stop offset="1" stopColor="#869d90" stopOpacity=".88"/></linearGradient>
    <linearGradient id={`${id}-liquid`} x1="0" y1="0" x2=".85" y2="1"><stop stopColor={clear ? "#f0f8f6" : "#e6a739"}/><stop offset=".35" stopColor={clear ? "#e3eeeb" : "#bd6c0b"}/><stop offset=".74" stopColor={clear ? "#c9dcda" : "#9b4c05"}/><stop offset="1" stopColor={clear ? "#e7f0ec" : "#d38b1b"}/></linearGradient>
    <linearGradient id={`${id}-wine`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor={whiteWine ? "#f6e5a1" : "#a74655"}/><stop offset=".45" stopColor={whiteWine ? "#d4ba56" : "#782233"}/><stop offset="1" stopColor={whiteWine ? "#b9a24a" : "#4b172b"}/></linearGradient>
    <linearGradient id={`${id}-beer`} x1="0" y1="0" x2="1" y2=".6"><stop stopColor="#cb7f0d"/><stop offset=".35" stopColor="#efc34c"/><stop offset=".7" stopColor="#dea220"/><stop offset="1" stopColor="#aa6206"/></linearGradient>
    <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="0"><stop stopColor="#c3c9c6"/><stop offset=".18" stopColor="#f4f7ee"/><stop offset=".4" stopColor="#c2c9c3"/><stop offset=".72" stopColor="#f6f6ec"/><stop offset="1" stopColor="#919c94"/></linearGradient>
    <linearGradient id={`${id}-bottle`} x1="0" y1="0" x2="1" y2="0"><stop stopColor={product.artKey === "clear" ? "#b8c3a0" : greenGlass ? "#254b26" : "#583716"}/><stop offset=".2" stopColor={product.artKey === "clear" ? "#edf2ce" : greenGlass ? "#769742" : "#a36f29"}/><stop offset=".45" stopColor={product.artKey === "clear" ? "#f4e3a2" : greenGlass ? "#426729" : "#704718"}/><stop offset=".75" stopColor={product.artKey === "clear" ? "#d7d1a0" : greenGlass ? "#567a30" : "#805721"}/><stop offset="1" stopColor={product.artKey === "clear" ? "#a4b48b" : greenGlass ? "#203a21" : "#3b2b16"}/></linearGradient>
  </defs>;
}

function Lowball({ product, id }: { product: ProductDef; id: string }) {
  const surface = lowballSurface(product);
  const shape = "M21 66Q60 53 99 66L92 151Q60 169 28 151Z";
  return <>
    <defs><clipPath id={`${id}-vessel-clip`}><path d={shape}/></clipPath></defs>
    <path d={shape} fill="#fff" stroke="#fff" strokeWidth="7" strokeLinejoin="round"/>
    <path d={shape} fill={`url(#${id}-glass)`} stroke="#97aaa0" strokeWidth="1.2"/>
    <g clipPath={`url(#${id}-vessel-clip)`}>
      <path d={`M23 ${surface}Q60 ${surface + 8} 97 ${surface}L92 151Q60 164 28 151Z`} fill={`url(#${id}-liquid)`} opacity={product.artKey === "clear" ? ".65" : ".95"}/>
      <ellipse cx="60" cy={surface} rx={36 - (surface - 66) * .065} ry="5.6" fill={product.artKey === "clear" ? "#eaf5f0" : "#e7ba52"} stroke={product.artKey === "clear" ? "#9bb7aa" : "#996016"} strokeWidth=".9"/>
      <path d="m29 73 5 74m8-75 2 81m16-82v85m17-85-3 81m17-78-5 74" stroke="#fff" strokeWidth="1.1" opacity=".33"/>
      <path d="M27 72c2 28 3 58 7 73" stroke="#fff" strokeWidth="3.4" opacity=".9"/>
      <path d="M91 76c0 24-2 46-5 65" stroke="#fff" strokeWidth="1.4" opacity=".76"/>
      <path d="M29 147q31 15 62 0v9q-31 15-62 0Z" fill="#bdcec1" opacity=".72"/>
      <path d="M30 151q30 14 60 0" fill="none" stroke="#839b8c" strokeWidth="1.5" opacity=".5"/>
      <path d="M31 151q29 12 57 0" fill="none" stroke="#fff" strokeWidth="3" opacity=".9"/>
      <path d="M31 156q29 11 57 0" fill="none" stroke="#f8fcf5" strokeWidth="1.4"/>
    </g>
    <ellipse cx="60" cy="66" rx="39" ry="7.5" fill="none" stroke="#82978b" strokeWidth="1.5"/>
    <ellipse cx="60" cy="66" rx="36.7" ry="5.7" fill="none" stroke="#e6eee6" strokeWidth=".9"/>
    <path d="M24 64q36-10 72 0" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
    <path d="m30 78 4 59m55-58-4 53" stroke="#8fa69a" strokeWidth=".75" opacity=".62"/>
  </>;
}

function Wine({ id }: { id: string }) {
  const bowl = "M29 29Q60 22 91 29L88 72C86 98 74 111 62 113L62 154Q70 158 85 160Q91 166 60 168Q29 166 35 160Q50 158 58 154V113C45 111 33 98 32 72Z";
  return <>
    <defs><clipPath id={`${id}-wine-clip`}><path d="M29 29H91L88 72C86 99 73 113 60 113S34 99 32 72Z"/></clipPath></defs>
    <path d={bowl} fill="#fff" stroke="#fff" strokeWidth="7" strokeLinejoin="round"/>
    <path d={bowl} fill={`url(#${id}-glass)`} stroke="#aebdb8" strokeWidth=".9"/>
    <g clipPath={`url(#${id}-wine-clip)`}><path d="M30 73H90V116H30Z" fill={`url(#${id}-wine)`} opacity=".9"/><ellipse cx="60" cy="73" rx="28" ry="5.1" fill={`url(#${id}-wine)`} stroke="#fff5cb" strokeWidth=".7"/><path d="M37 36c-1 31 2 49 13 60" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".9"/><path d="M82 37c1 23-1 37-5 49" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity=".7"/></g>
    <ellipse cx="60" cy="29" rx="31" ry="5.4" fill="none" stroke="#a7b5af" strokeWidth="1.1"/><path d="M32 27q28-7 56 0" fill="none" stroke="#fff" strokeWidth="1.7"/><path d="M60 116v38m-20 8q20 5 40 0" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
  </>;
}

function Beer({ id }: { id: string }) {
  const shape = "M26 46Q60 37 94 46L84 155Q60 166 36 155Z";
  return <>
    <defs><clipPath id={`${id}-beer-clip`}><path d={shape}/></clipPath></defs>
    <path d={shape} fill="#fff" stroke="#fff" strokeWidth="7" strokeLinejoin="round"/>
    <path d={shape} fill={`url(#${id}-glass)`} stroke="#b2b8a6" strokeWidth="1"/>
    <g clipPath={`url(#${id}-beer-clip)`}><path d="M25 51H95L84 155Q60 165 36 155Z" fill={`url(#${id}-beer)`}/><ellipse cx="60" cy="52" rx="35" ry="8" fill="#fbf2d8"/><path d="M26 49q3-7 8-3 4-6 9-2 6-7 12-2 6-6 12-1 5-4 10-1 9-4 17 8v14q-34 8-68 0Z" fill="#fff8e8"/>
      {[{x:44,y:97,r:1},{x:72,y:112,r:1.3},{x:60,y:81,r:.8},{x:51,y:135,r:1},{x:78,y:74,r:.9},{x:39,y:119,r:.6},{x:66,y:145,r:.6},{x:59,y:110,r:.6}].map((bubble,i)=><circle key={i} cx={bubble.x} cy={bubble.y} r={bubble.r} fill="#fff5c5" opacity=".8"/>)}
      <path d="m32 69 8 80m45-79-7 78" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".72"/><path d="m42 156q18 4 36 0" stroke="#fff" strokeWidth="3" opacity=".9"/>
    </g><ellipse cx="60" cy="46" rx="34" ry="7" fill="none" stroke="#bdbbad" strokeWidth="1.1"/><path d="M29 44q31-8 62 0" stroke="#fff" strokeWidth="2" fill="none"/>
  </>;
}

function Bottle({ product, id }: { product: ProductDef; id: string }) {
  const small = (product.volumeMl ?? 650) <= 350;
  const top = small ? 26 : 14;
  const shoulder = small ? 74 : 67;
  const shape = `M49 ${top}H71V${shoulder - 23}C71 ${shoulder - 12} 84 ${shoulder - 9} 84 ${shoulder + 4}V157Q84 169 60 169Q36 169 36 157V${shoulder + 4}C36 ${shoulder - 9} 49 ${shoulder - 12} 49 ${shoulder - 23}Z`;
  return <>
    <path d={shape} fill="#fff" stroke="#fff" strokeWidth="7" strokeLinejoin="round"/>
    <path d={shape} fill={`url(#${id}-bottle)`} stroke="#6c673f" strokeWidth=".9"/>
    <path d={`M54 ${top + 8}v${shoulder - top - 24}c0 13-11 17-11 29v72`} fill="none" stroke="#ffffda" strokeWidth="4.5" strokeLinecap="round" opacity=".46"/>
    <path d={`M67 ${top + 9}v${shoulder - top - 26}c0 14 10 18 10 30v69`} fill="none" stroke="#fff7c3" strokeWidth="1.2" opacity=".3"/>
    <rect x="47" y={top - 1} width="26" height="10" rx="2" fill={`url(#${id}-metal)`} stroke="#a4a69b" strokeWidth=".8"/>
    <path d={`M49 ${top + 2}h22M50 ${top + 5}h20`} stroke="#fff" strokeWidth=".7" opacity=".7"/>
    <path d="M37 105q23-6 46 0v34q-23 7-46 0Z" fill="#f5f0df" stroke="#e2dcc8" strokeWidth=".7"/>
    <path d="M38 110q22-5 44 0M38 133q22 5 44 0" stroke={product.band} strokeWidth="2.4" fill="none" opacity=".9"/>
    <path d="M48 120h24m-20 4h16" stroke="#989480" strokeWidth="1.1" opacity=".75"/>
    <path d="M42 158q18 7 36 0" stroke="#c5b78b" strokeWidth="2.4" fill="none" opacity=".55"/>
  </>;
}

function Can({ product, id }: { product: ProductDef; id: string }) {
  const shape = "M32 36Q60 27 88 36V153Q88 165 60 165Q32 165 32 153Z";
  return <>
    <defs><clipPath id={`${id}-can-clip`}><path d={shape}/></clipPath></defs>
    <path d={shape} fill="#fff" stroke="#fff" strokeWidth="7" strokeLinejoin="round"/>
    <path d={shape} fill={`url(#${id}-metal)`} stroke="#9ba498" strokeWidth=".9"/>
    <g clipPath={`url(#${id}-can-clip)`}><path d="M32 54q28-6 56 0v87q-28 9-56 0Z" fill="#f2eedf"/><path d="M32 62q28-7 56 0v8q-28-7-56 0Z" fill={product.band}/><path d="M32 130q28 7 56 0v8q-28 7-56 0Z" fill={product.band}/><path d="M43 44v104" stroke="#fff" strokeWidth="5" opacity=".55"/><path d="M80 48v98" stroke="#748071" strokeWidth="2" opacity=".2"/><path d="M47 95h26m-22 6h18" stroke="#797f68" strokeWidth="1.6" opacity=".7"/></g>
    <ellipse cx="60" cy="36" rx="28" ry="6" fill={`url(#${id}-metal)`} stroke="#a2aaa0" strokeWidth="1"/><ellipse cx="60" cy="36" rx="22" ry="3.8" fill="none" stroke="#b1b8aa" strokeWidth=".75"/><path d="M53 35q6-4 14 0l-2 3h-9Z" fill="#8c978a" stroke="#e9eee2" strokeWidth="1"/><path d="M36 154q24 8 48 0" stroke="#fff" strokeWidth="1.7" fill="none"/>
  </>;
}

export function StickerObject({ product, size = "md", lit = false, className }: StickerObjectProps) {
  const id = useId().replace(/:/g, "");
  const vessel = product.kind === "cig" ? "cig" : vesselFor(product);
  const tip = getStickerTip(product);
  const style = {
    "--sticker-tip-x": `${tip.x}%`,
    "--sticker-tip-y": `${tip.y}%`,
  } as CSSProperties;
  return <span className={cn("sticker-object", `sticker-object--${vessel}`, `sticker-object--${size}`, lit && "sticker-object--lit", className)} style={style} role="img" aria-label={`${product.name}${lit && product.kind === "cig" ? ", lit" : ""}`} data-sticker-object="" data-kind={product.kind} data-vessel={vessel}>
    <svg className="sticker-object__art" viewBox="0 0 120 180" fill="none" aria-hidden="true" focusable="false">
      {product.kind === "cig" ? <Cigarette product={product} lit={lit} id={id}/> : <><VesselDefinitions product={product} id={id}/>{vessel === "bottle" ? <Bottle product={product} id={id}/> : vessel === "can" ? <Can product={product} id={id}/> : vessel === "wine" ? <Wine id={id}/> : vessel === "beer" ? <Beer id={id}/> : <Lowball product={product} id={id}/>}</>}
    </svg>
    {product.kind === "cig" && <span className="sticker-object__tip-anchor" aria-hidden="true"/>}
  </span>;
}
