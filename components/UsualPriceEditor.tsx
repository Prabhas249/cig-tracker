"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { displayCost, type ProductDef } from "@/lib/catalog";
import { suggestedLoosePrice } from "@/lib/pricing";
import type { User } from "@/lib/social-types";
import { fmtINR } from "@/lib/time";
import { ProductShot } from "./ProductShot";
import "./usual-price-editor.css";

export type UsualPriceEditorProps = {
  product: ProductDef;
  user: User;
  pending: boolean;
  error?: string;
  onSave: (price: number | null) => Promise<boolean>;
  onCancel: () => void;
};

function priceUnit(product: ProductDef): string {
  if (product.kind === "cig") return "stick";
  const volume = product.volumeMl;
  if (volume) return `${volume}ml ${product.unitName}`;
  return product.unitName;
}

export function UsualPriceEditor({ product, user, pending, error, onSave, onCancel }: UsualPriceEditorProps) {
  const override = user.priceOverrides[product.id];
  const hasOverride = typeof override === "number" && Number.isFinite(override) && override >= 0;
  const suggested = product.kind === "cig" ? suggestedLoosePrice(product.id, user.defaultPrice) : displayCost(product);
  const current = hasOverride ? override : suggested;
  // Parent keys this form by account + product. Sync must not erase a draft.
  const [draft, setDraft] = useState(() => String(current));
  const [fieldError, setFieldError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState<"price" | "suggested" | null>(null);
  const inFlight = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const hintId = `${id}-hint`;
  const fieldErrorId = `${id}-error`;
  const busy = pending || saving !== null;
  const unit = priceUnit(product);
  const formError = error || saveError;

  async function save(value: number | null) {
    if (busy || inFlight.current) return;
    inFlight.current = true;
    setSaving(value === null ? "suggested" : "price");
    setSaveError("");
    try {
      const saved = await onSave(value);
      if (!saved) setSaveError("Couldn’t save your price. Check your connection and try again.");
    } catch {
      setSaveError("Couldn’t save your price. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      setSaving(null);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || inFlight.current) return;
    const amount = Number(draft);
    const validation = !draft.trim() || !Number.isFinite(amount)
      ? "Enter your usual price in rupees."
      : amount < 0 || amount > 100000
        ? "Enter a price from ₹0 to ₹1,00,000."
        : Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001
          ? "Use no more than two decimal places."
          : "";
    setFieldError(validation);
    if (validation) { requestAnimationFrame(() => input.current?.focus()); return; }
    void save(Math.round(amount * 100) / 100);
  }

  return <form className="usual-price-editor" onSubmit={submit} noValidate aria-busy={busy}>
    <div className="usual-price-editor__product">
      <span className="usual-price-editor__object" aria-hidden="true"><ProductShot product={product} size="md"/></span>
      <div>
        <strong className="usual-price-editor__name">{product.name}</strong>
        <span className="usual-price-editor__variant">{product.variant}</span>
        <span className="usual-price-editor__current">Current usual price</span>
        <span className="usual-price-editor__amount"><strong>{fmtINR(current)}</strong> / {unit}</span>
      </div>
    </div>

    <p className="usual-price-editor__intro">Set the price for your future quick logs. Past check-ins keep the prices you recorded.</p>

    <label className="usual-price-editor__label" htmlFor={id}>Usual price (₹)</label>
    <input
      ref={input}
      id={id}
      name="usual-price"
      className="usual-price-editor__input"
      type="number"
      inputMode="decimal"
      min={0}
      max={100000}
      step={0.01}
      required
      readOnly={busy}
      value={draft}
      onChange={event => { setDraft(event.target.value); setFieldError(""); setSaveError(""); }}
      aria-invalid={fieldError ? true : undefined}
      aria-describedby={`${hintId}${fieldError ? ` ${fieldErrorId}` : ""}`}
    />
    <p id={hintId} className="usual-price-editor__hint">Per {unit}. You can still change the price for an individual check-in.</p>
    {fieldError && <p id={fieldErrorId} className="usual-price-editor__error">{fieldError}</p>}

    {hasOverride && <button className="usual-price-editor__reset" type="button" disabled={busy} onClick={() => { setFieldError(""); void save(null); }}>
      <span>{saving === "suggested" ? "Resetting price…" : "Use suggested price"}</span><span>{fmtINR(suggested)} / {unit}</span>
    </button>}

    {formError && <p className="usual-price-editor__error usual-price-editor__form-error" role="alert">{formError}</p>}
    <p className="usual-price-editor__account">Only your saved price · <bdi>@{user.username}</bdi></p>
    <div className="usual-price-editor__actions">
      <button type="button" className="button secondary" disabled={busy} onClick={onCancel}>Cancel</button>
      <button type="submit" className="button primary" disabled={busy}>{saving === "price" || (pending && saving !== "suggested") ? "Saving price…" : "Save price"}</button>
    </div>
  </form>;
}

export default UsualPriceEditor;
