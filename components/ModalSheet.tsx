"use client";

import { useEffect, useId, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { animate, motion, useMotionTemplate, useMotionValue, useReducedMotionConfig } from "motion/react";
import { X } from "lucide-react";
import "./modal-sheet.css";

type ModalShellProps = { title: string; children: ReactNode; close: () => void; dismissible?: boolean };
type Playback = ReturnType<typeof animate>;
type Drag = { id: number; start: number; origin: number; distance: number; moved: boolean; samples: { y: number; time: number }[] };
const EASE_OUT = [.2, 0, 0, 1] as const;
const SNAP = { type: "spring", duration: .3, bounce: 0 } as const;

function rubberBand(distance: number, limit: number): number {
  return limit * (1 - 1 / (Math.abs(distance) * .55 / limit + 1));
}

/** A native modal keeps its focus trap until the sheet has finished dismissing. */
export default function ModalShell({ title, children, close, dismissible = true }: ModalShellProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const grabber = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const reduceMotion = useReducedMotionConfig();
  const reduced = useRef(!!reduceMotion); reduced.current = !!reduceMotion;
  const closeRef = useRef(close); closeRef.current = close;
  const canDismiss = useRef(dismissible); canDismiss.current = dismissible;
  const mounted = useRef(false);
  const closingRef = useRef(false);
  const completed = useRef(false);
  const generation = useRef(0);
  const animations = useRef<Playback[]>([]);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const backdropPressed = useRef(false);
  const [closing, setClosing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const y = useMotionValue(0);
  const opacity = useMotionValue(0);
  const backdrop = useMotionValue(0);
  const transform = useMotionTemplate`translate3d(0, ${y}px, 0)`;

  function stop() {
    generation.current += 1;
    for (const animation of animations.current) animation.stop();
    animations.current = [];
  }
  function releaseDrag() {
    const gesture = drag.current;
    drag.current = null;
    if (gesture && grabber.current?.hasPointerCapture(gesture.id)) grabber.current.releasePointerCapture(gesture.id);
    setDragging(false);
  }
  function finishClose() {
    if (!mounted.current || completed.current || !canDismiss.current) return;
    completed.current = true;
    stop();
    closeRef.current();
  }
  function settle(velocity = 0) {
    stop();
    if (reduced.current) {
      y.jump(0); opacity.jump(1); backdrop.jump(1);
      return;
    }
    animations.current = [
      animate(y, 0, { ...SNAP, velocity }),
      animate(opacity, 1, { duration: .12, ease: EASE_OUT }),
      animate(backdrop, 1, { duration: .16, ease: EASE_OUT }),
    ];
  }
  function dismiss(immediate = false) {
    if (!canDismiss.current || completed.current) return;
    if (closingRef.current) { if (immediate || reduced.current) finishClose(); return; }
    closingRef.current = true;
    releaseDrag();
    stop();
    if (immediate || reduced.current) { finishClose(); return; }
    setClosing(true);
    const current = generation.current;
    // A short continuation preserves the gesture's direction without a long exit.
    animations.current = [
      animate(y, Math.max(18, y.get() + 18), { duration: .18, ease: EASE_OUT }),
      animate(opacity, 0, { duration: .16, ease: EASE_OUT }),
      animate(backdrop, 0, { duration: .18, ease: EASE_OUT }),
    ];
    void Promise.all(animations.current).then(() => {
      if (mounted.current && current === generation.current && closingRef.current && canDismiss.current) finishClose();
    });
  }

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    mounted.current = true;
    completed.current = false;
    closingRef.current = false;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const keyboardOpen = !!trigger?.matches(":focus-visible");
    if (!node.open) node.showModal();
    const viewport = window.visualViewport;
    const fitViewport = () => {
      if (!viewport) return;
      node.style.height = `${viewport.height}px`;
      node.style.top = `${viewport.offsetTop}px`;
    };
    fitViewport();
    viewport?.addEventListener("resize", fitViewport);
    viewport?.addEventListener("scroll", fitViewport);
    const instant = reduced.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches || keyboardOpen;
    if (instant) { y.jump(0); opacity.jump(1); backdrop.jump(1); }
    else {
      y.jump(40); opacity.jump(0); backdrop.jump(0);
      animations.current = [
        animate(y, 0, SNAP),
        animate(opacity, 1, { duration: .18, ease: EASE_OUT }),
        animate(backdrop, 1, { duration: .22, ease: EASE_OUT }),
      ];
    }
    return () => {
      mounted.current = false;
      stop();
      const gesture = drag.current; drag.current = null;
      if (gesture && grabber.current?.hasPointerCapture(gesture.id)) grabber.current.releasePointerCapture(gesture.id);
      viewport?.removeEventListener("resize", fitViewport);
      viewport?.removeEventListener("scroll", fitViewport);
      if (node.open) node.close();
      // A replacement dialog takes precedence over restoring an old trigger.
      queueMicrotask(() => {
        if (document.querySelector("dialog[open]")) return;
        if (trigger?.isConnected && !trigger.closest("[inert]")) trigger.focus({ preventScroll: true });
        else document.querySelector<HTMLElement>("main")?.focus({ preventScroll: true });
      });
    };
    // The shell stays mounted while its form content changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (dismissible && !reduceMotion) return;
    // Pending work can begin during a drag or even during the exit animation.
    // Stop that exit before it is allowed to unmount a form with work in flight.
    releaseDrag();
    if (closingRef.current && dismissible && reduceMotion) { finishClose(); return; }
    if (closingRef.current && !dismissible) {
      closingRef.current = false;
      setClosing(false);
    }
    if (!closingRef.current) settle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissible, reduceMotion]);

  function pointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0 || drag.current || closingRef.current || !canDismiss.current) return;
    stop();
    suppressClick.current = false;
    const time = performance.now();
    drag.current = { id: event.pointerId, start: event.clientY, origin: y.get(), distance: 0, moved: false, samples: [{ y: event.clientY, time }] };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const gesture = drag.current;
    if (!gesture || event.pointerId !== gesture.id || !canDismiss.current) return;
    const now = performance.now();
    gesture.distance = event.clientY - gesture.start;
    gesture.moved ||= Math.abs(gesture.distance) > 5;
    gesture.samples = [...gesture.samples.filter(sample => now - sample.time < 100), { y: event.clientY, time: now }];
    const raw = gesture.origin + gesture.distance;
    const boundary = Math.max(96, (panel.current?.offsetHeight ?? 400) * .4);
    const offset = raw < 0 ? -rubberBand(raw, 26) : raw > boundary ? boundary + rubberBand(raw - boundary, 80) : raw;
    if (!reduced.current) {
      y.set(offset);
      backdrop.set(Math.max(.25, 1 - Math.max(0, offset) / Math.max(panel.current?.offsetHeight ?? 400, 1)));
    }
  }
  function pointerUp(event: PointerEvent<HTMLButtonElement>) {
    const gesture = drag.current;
    if (!gesture || event.pointerId !== gesture.id) return;
    suppressClick.current = gesture.moved;
    const last = gesture.samples[gesture.samples.length - 1];
    const first = gesture.samples[0];
    const velocity = performance.now() - last.time > 100 ? 0 : (last.y - first.y) / Math.max(1, last.time - first.time);
    const threshold = Math.min(108, Math.max(64, (panel.current?.offsetHeight ?? 400) * .2));
    releaseDrag();
    if (canDismiss.current && (gesture.distance > threshold || (gesture.distance > 18 && velocity > .55))) dismiss();
    else settle(velocity * 1000);
  }
  function cancelDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current || drag.current.id !== event.pointerId) return;
    suppressClick.current = drag.current.moved;
    releaseDrag();
    if (!closingRef.current) settle();
  }
  function handleGrabberClick(event: MouseEvent<HTMLButtonElement>) {
    if (event.detail !== 0 && suppressClick.current) { suppressClick.current = false; event.preventDefault(); return; }
    suppressClick.current = false;
    dismiss(event.detail === 0);
  }

  return <motion.dialog ref={dialog} layoutRoot className="modal modal-sheet" aria-labelledby={titleId} data-phase={closing ? "closing" : dragging ? "dragging" : "open"}
    onCancel={event => { event.preventDefault(); dismiss(true); }}
    onClose={() => {
      if (!mounted.current || completed.current || dialog.current?.open) return;
      if (!canDismiss.current) { if (!dialog.current?.open) dialog.current?.showModal(); }
      else finishClose();
    }}
    onPointerDown={event => { backdropPressed.current = event.isPrimary && event.button === 0 && (event.target === event.currentTarget || event.target === event.currentTarget.firstElementChild); }}
    onClick={event => {
      if (backdropPressed.current && (event.target === event.currentTarget || event.target === event.currentTarget.firstElementChild)) dismiss();
      backdropPressed.current = false;
    }}>
    <motion.div className="modal-sheet__backdrop" style={{ opacity: backdrop }} aria-hidden="true"/>
    <motion.div ref={panel} layoutScroll className="modal-sheet__panel" style={{ transform, opacity }}>
      <div className="modal-inner">
        <button ref={grabber} type="button" className="sheet-grabber modal-sheet__grabber" aria-label="Close sheet" disabled={!dismissible || closing}
          onClick={handleGrabberClick} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}><span/></button>
        <div className="modal-heading"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button modal-sheet__close" disabled={!dismissible || closing} onClick={event => dismiss(event.detail === 0)} aria-label="Close dialog"><X size={20}/></button></div>
        {children}
      </div>
    </motion.div>
  </motion.dialog>;
}
