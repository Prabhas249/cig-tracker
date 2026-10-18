"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotionConfig } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { Check, LoaderCircle, Plus } from "lucide-react";
import "./motion-ui.css";

export function ActionMark({state}:{state:"ready"|"saving"|"saved"}) {
  const reduce = useReducedMotionConfig();
  return <span className="action-mark" aria-hidden="true"><AnimatePresence initial={false}>
    <motion.span key={state} initial={reduce?false:{opacity:0,scale:.25,filter:"blur(4px)"}} animate={{opacity:1,scale:1,filter:"blur(0px)"}} exit={{opacity:0,scale:reduce?1:.25,filter:reduce?"none":"blur(4px)"}} transition={{type:"spring",duration:reduce?0:.3,bounce:0}}>
      {state==="saving"?<LoaderCircle className="action-mark__spinner" size={15}/>:state==="saved"?<Check size={15}/>:<Plus size={15}/>}
    </motion.span>
  </AnimatePresence></span>;
}

/** Exact values stay readable; only infrequent changes receive a short transition. */
export function AnimatedValue({ value }: { value: string | number }) {
  const reduce = useReducedMotionConfig();
  return <span className="animated-value"><span className="sr-only">{value}</span><span className="animated-value__visual" aria-hidden="true">
    <AnimatePresence initial={false} mode="popLayout"><motion.span key={String(value)} initial={reduce ? false : {opacity:0,transform:"translateY(5px)"}} animate={{opacity:1,transform:"translateY(0px)"}} exit={reduce ? {opacity:0} : {opacity:0,transform:"translateY(-5px)"}} transition={{duration:reduce ? 0 : .18,ease:[.2,0,0,1]}}>{value}</motion.span></AnimatePresence>
  </span></span>;
}

/** A single compositor layer, retargeted immediately on rapid navigation. */
export function ViewSurface({ view, children }: { view: string; children: ReactNode }) {
  const node = useRef<HTMLDivElement>(null);
  const previous = useRef(view);
  const reduce = useReducedMotionConfig();
  useLayoutEffect(() => {
    if (previous.current === view) return;
    previous.current = view;
    if (reduce || !node.current) return;
    const animation = node.current.animate([
      {opacity:.45,transform:"translateY(6px)"}, {opacity:1,transform:"translateY(0px)"},
    ], {duration:200,easing:"cubic-bezier(.2,0,0,1)"});
    return () => animation.cancel();
  }, [view,reduce]);
  return <div ref={node} className="view-surface">{children}</div>;
}

type Destination = {id:string;name:string;icon:LucideIcon};
export function PhoneNavigation({items,view,requests,onNavigate}:{items:Destination[];view:string;requests:number;onNavigate:(id:string,animate:boolean)=>void}) {
  const reduce = useReducedMotionConfig();
  const id = useId();
  return <LayoutGroup id={id}><motion.nav layoutRoot className="phone-nav premium-nav" aria-label="App navigation">
    {items.map(item=><a key={item.id} href={`#${item.id}`} aria-current={view===item.id?"page":undefined} className={view===item.id?"active":""} onClick={event=>{
      if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return;
      event.preventDefault();onNavigate(item.id,event.detail>0);
    }}>
      {view===item.id&&<motion.span className="nav-selection" layoutId="selected-destination" initial={false} transition={{type:"spring",duration:reduce?0:.3,bounce:0}} aria-hidden="true"/>}
      <span className="nav-symbol"><item.icon size={21}/>{item.id==="circle"&&requests>0&&<i>{requests}</i>}</span><span className="nav-label">{item.name}</span>
    </a>)}
  </motion.nav></LayoutGroup>;
}

export function SegmentedControl<T extends string>({label,value,items,onChange,className=""}:{label:string;value:T;items:ReadonlyArray<{value:T;label:string;icon?:ReactNode}>;onChange:(value:T)=>void;className?:string}) {
  const reduce = useReducedMotionConfig();
  const [pointer,setPointer] = useState(false);
  const index = Math.max(0,items.findIndex(item=>item.value===value));
  return <div className={`segmented premium-segment ${className}`} role="group" aria-label={label} data-motion={pointer&&!reduce?"on":"off"}>
    <span className="premium-segment__selection" aria-hidden="true" style={{width:`calc((100% - 8px) / ${items.length})`,transform:`translateX(${index*100}%)`}}/>
    {items.map(item=><button type="button" key={item.value} aria-pressed={value===item.value} className={value===item.value?"selected":""} onClick={event=>{setPointer(event.detail>0);onChange(item.value);}}>{item.icon}{item.label}</button>)}
  </div>;
}

export function SaveNotice({notice,children}:{notice:string;children:ReactNode}) {
  const reduce = useReducedMotionConfig();
  return <AnimatePresence initial={false}>{notice&&<motion.div className="mobile-toast premium-notice" initial={reduce?false:{opacity:0,transform:"translateY(10px) scale(.98)"}} animate={{opacity:1,transform:"translateY(0px) scale(1)"}} exit={{opacity:0,transform:reduce?"none":"translateY(6px) scale(.99)"}} transition={{duration:reduce?0:.18,ease:[.2,0,0,1]}}>{children}</motion.div>}</AnimatePresence>;
}

/** Placeholder geometry follows the compact home; it never invents account data. */
export function TrackerSkeleton() {
  return <div className="tracker-skeleton" role="status"><span className="sr-only">Opening your tracker…</span><div aria-hidden="true">
    <div className="tracker-skeleton__date"/><div className="tracker-skeleton__filter"/>
    <div className="tracker-skeleton__hero"><span/><div><i/><i/></div><span/></div>
    <div className="tracker-skeleton__heading"/>
    {[0,1].map(row=><div className="tracker-skeleton__shelf" key={row}>{[0,1,2,3].map(column=><span key={column}><i/><b/></span>)}</div>)}
  </div></div>;
}
