"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Cigarette, Lock, Plus, Search, Wine, X } from "lucide-react";
import { CATALOG, type Kind } from "@/lib/catalog";
import type { User } from "@/lib/social-types";
import { ProductShot } from "./ProductShot";
import "./favorite-picker.css";

type Props = {
  user: User;
  initialKind: Kind;
  pending: boolean;
  error: string;
  onSave: (ids: string[], expected: string[]) => Promise<boolean>;
  onReload: () => Promise<string[] | null>;
  onCancel: () => void;
  onEdit: () => void;
};

const same = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);
const kindOf = (id: string) => CATALOG.find(product => product.id === id)?.kind;

export default function FavoritePicker({ user, initialKind, pending, error, onSave, onReload, onCancel, onEdit }: Props) {
  // A sync update must never erase a person's unfinished choices. The saved
  // snapshot is compared by the store before committing this complete draft.
  const [expected, setExpected] = useState(() => [...user.favoriteIds]);
  const [draft, setDraft] = useState(() => [...user.favoriteIds]);
  const [kind, setKind] = useState(initialKind);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [reloading, setReloading] = useState(false);
  const searchId = useId();
  const hintId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const slotsRef = useRef<HTMLOListElement>(null);
  const focusAfterEdit = useRef<string | null>(null);
  const chosen = draft.filter(id => kindOf(id) === kind);
  const counts = { cig: draft.filter(id => kindOf(id) === "cig").length, drink: draft.filter(id => kindOf(id) === "drink").length };
  const changed = !same(draft, expected);
  const stale = !same(user.favoriteIds, expected);
  const busy = pending || reloading;
  const products = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase("en-IN").split(/\s+/).filter(Boolean);
    return CATALOG.filter(product => product.kind === kind && terms.every(term => `${product.name} ${product.brand} ${product.variant}`.toLocaleLowerCase("en-IN").includes(term)));
  }, [kind, query]);
  useLayoutEffect(() => {
    const id = focusAfterEdit.current;
    if (!id) return;
    focusAfterEdit.current = null;
    if (id === "search") searchRef.current?.focus();
    else slotsRef.current?.querySelector<HTMLButtonElement>(`[data-favorite-id="${id}"] .favorite-picker__remove`)?.focus();
  }, [draft]);

  function update(ids: string[], announcement: string) {
    onEdit();
    setDraft(ids);
    setMessage(announcement);
  }
  function toggle(id: string) {
    const product = CATALOG.find(product => product.id === id)!;
    if (draft.includes(id)) update(draft.filter(item => item !== id), `${product.name} removed. ${chosen.length - 1} of 3 selected.`);
    else if (chosen.length >= 3) setMessage("Your three spots are full. Remove a favorite above to add another.");
    else update([...draft, id], `${product.name} added in position ${chosen.length + 1}.`);
  }
  function earlier(id: string) {
    const index = draft.indexOf(id);
    const previous = draft.indexOf(chosen[chosen.indexOf(id) - 1]);
    if (previous < 0) return;
    const next = [...draft];
    [next[index], next[previous]] = [next[previous], next[index]];
    update(next, `${CATALOG.find(product => product.id === id)!.name} moved to position ${chosen.indexOf(id)}.`);
  }
  async function reload() {
    setReloading(true);
    try {
      const latest = await onReload();
      if (latest) { focusAfterEdit.current="search"; setDraft([...latest]); setExpected([...latest]); onEdit(); setMessage("Latest saved favorites loaded. Your draft has been reset."); }
      else setMessage("Couldn’t reload your favorites. Check your connection and try again.");
    } catch { setMessage("Couldn’t reload your favorites. Check your connection and try again."); }
    finally { setReloading(false); }
  }

  return <form className="favorite-picker" onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    if (counts.cig > 3 || counts.drink > 3) { setMessage("Choose up to three favorites for each shelf before saving."); return; }
    if (!changed) { onCancel(); return; }
    await onSave(draft, expected);
  }}>
    <p className="favorite-picker__intro">Your brands, in your order. Choose up to three for each home shelf.</p>
    <div className="segmented favorite-picker__tabs" role="group" aria-label="Favorite type">
      {([{id:"cig", name:"Smoke", Icon:Cigarette}, {id:"drink", name:"Drink", Icon:Wine}] as const).map(item => <button type="button" key={item.id} aria-pressed={kind === item.id} className={kind === item.id ? "selected" : ""} disabled={busy} onClick={() => { setKind(item.id); setQuery(""); setMessage(""); }}><item.Icon size={16}/>{item.name}<span>{counts[item.id]}/3</span></button>)}
    </div>

    <section className="favorite-picker__selection" aria-label={`${kind === "cig" ? "Cigarette" : "Drink"} favorites in home shelf order`}>
      <div className="favorite-picker__heading"><h3>On your home shelf</h3><span>{chosen.length} of 3 selected</span></div>
      <ol ref={slotsRef} className="favorite-picker__slots">
        {Array.from({length:Math.max(3, chosen.length)}, (_, index) => {
          const product = CATALOG.find(item => item.id === chosen[index]);
          return <li key={product?.id ?? `empty-${index}`} data-favorite-id={product?.id} className={product ? "favorite-picker__slot" : "favorite-picker__slot is-empty"}>
            <span className="favorite-picker__number" aria-label={`Position ${index + 1}`}>{String(index + 1).padStart(2,"0")}</span>
            {product ? <>
              <button type="button" className="favorite-picker__remove" aria-label={`Remove ${product.name} from favorites`} disabled={busy} onClick={event => {if(event.detail===0)focusAfterEdit.current=chosen[index+1]??chosen[index-1]??"search";toggle(product.id);}}><X size={14}/></button>
              <span className="favorite-picker__object" aria-hidden="true"><ProductShot product={product} size="sm"/></span>
              <strong>{product.name}</strong>
              <button type="button" className="favorite-picker__move" disabled={busy || index === 0} aria-label={`Move ${product.name} earlier`} onClick={event => {if(event.detail===0&&index===1)focusAfterEdit.current=product.id;earlier(product.id);}}><ArrowLeft size={13}/><span>Earlier</span></button>
            </> : <button type="button" className="favorite-picker__empty-slot" disabled={busy} onClick={() => { searchRef.current?.focus(); searchRef.current?.scrollIntoView({block:"center",behavior:"instant"}); }} aria-label={`Choose favorite for position ${index + 1}`}><Plus size={22}/><span>Choose<br/>a favorite</span></button>}
          </li>;
        })}
      </ol>
      <p className="favorite-picker__order-hint">Use Earlier to change the shelf order.</p>
    </section>

    <div className="favorite-picker__search">
      <label htmlFor={searchId} className="sr-only">Search favorites by brand or variant</label><Search size={18} aria-hidden="true"/>
      <input ref={searchRef} id={searchId} type="search" name="favorite-search" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")event.preventDefault();}} placeholder="Find your brand or variant" autoComplete="off" enterKeyHint="search" aria-describedby={hintId}/>
      {query && <button type="button" aria-label="Clear favorites search" onClick={() => {setQuery("");searchRef.current?.focus();}}><X size={17}/></button>}
    </div>
    <p id={hintId} className="favorite-picker__limit">{chosen.length >= 3 ? "Three spots filled. Remove one above to make room." : "Tap a brand to add it. Nothing gets logged here."}</p>
    <p className="favorite-picker__feedback" role="status" aria-live="polite" aria-atomic="true">{message}</p>
    <div className="favorite-picker__heading"><h3>{query ? "Search results" : "All brands"}</h3><span>{products.length} {products.length === 1 ? "match" : "matches"}</span></div>
    {products.length ? <ul className="favorite-picker__results">{products.map(product => {
      const index = chosen.indexOf(product.id);
      const selected = index !== -1;
      return <li key={product.id}>
        <label className="favorite-picker__choice" data-selected={selected || undefined}>
          <input type="checkbox" checked={selected} disabled={busy} onChange={() => toggle(product.id)} aria-label={`${product.name}${selected ? `, favorite ${index + 1}` : ""}`}/>
          <span className="favorite-picker__choice-art" aria-hidden="true"><ProductShot product={product} size="sm"/></span>
          <span className="favorite-picker__choice-copy"><strong>{product.name}</strong><small>{product.variant}</small></span>
          <span className="favorite-picker__check" aria-hidden="true">{selected ? <Check size={16}/> : <Plus size={17}/>}</span>
        </label>
      </li>;
    })}</ul> : <div className="favorite-picker__no-results"><p>No matching brands.</p><button type="button" onClick={() => {setQuery("");searchRef.current?.focus();}}>Clear search</button></div>}

    <footer className="favorite-picker__footer">
      {(error || stale) && <div className="favorite-picker__error"><p role="alert">{error || "Your saved favorites changed on another device. Your draft is still here."}</p><button type="button" disabled={busy} onClick={() => void reload()}>{reloading ? "Reloading…" : "Reload saved favorites"}</button></div>}
      <p className="favorite-picker__account"><Lock size={12} aria-hidden="true"/><span>Only your shelf · @{user.username}</span><span>{changed ? "Unsaved changes" : "Saved choices"}</span></p>
      <div className="favorite-picker__actions"><button type="button" className="button secondary" disabled={busy} onClick={onCancel}>Cancel</button><button className="button primary" disabled={busy}>{pending ? "Saving favorites…" : "Save favorites"}<Check size={16}/></button></div>
    </footer>
  </form>;
}
