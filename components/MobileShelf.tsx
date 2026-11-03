"use client";

import { useId, useMemo, useRef, useState } from "react";
import { CATALOG, displayCost, type Kind, type ProductDef } from "@/lib/catalog";
import { getPriceReference, suggestedLoosePrice, type PriceReference } from "@/lib/pricing";
import type { User } from "@/lib/social-types";
import { fmtINR } from "@/lib/time";
import { CloseIcon } from "./Icons";
import { ChevronRight, Star } from "lucide-react";
import { ActionMark } from "./MotionUI";
import { ProductShot } from "./ProductShot";
import "./mobile-shelf.css";
import { objectOrigin, type ObjectOrigin } from "@/lib/object-origin";

type MobileShelfProps = {
  kind: Kind;
  user: User | null;
  pending: boolean;
  savingProduct?: string|null;
  savedProduct?: string|null;
  onQuickLog: (id: string, origin?: ObjectOrigin) => void;
  onDetailedLog: (id: string) => void;
  onEditFavorites: () => void;
  onEditUsualPrice: (id: string) => void;
};

function checkedDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function unitLabel(product: ProductDef) {
  if (product.kind === "cig") return "stick";
  if (product.unitName === "peg") return "30ml peg";
  if (product.unitName === "glass") return "150ml glass";
  return product.unitName;
}

function PriceDetails({ product, reference }: { product: ProductDef; reference: PriceReference | null }) {
  return (
    <details className="mobile-shelf__reference">
      <summary>
        <span>{reference ? "Pack reference" : "Price note"}</span>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="m5 6 3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="mobile-shelf__reference-body">
        {reference ? (
          <>
            <p>
              {fmtINR(reference.packPrice)} for a pack of {reference.packSize} · {fmtINR(reference.unitPrice)} per stick.
              {" "}Loose prices can differ.
            </p>
            <p className="mobile-shelf__reference-date">Checked {checkedDate(reference.checkedAt)}.</p>
            <a href={reference.sourceUrl} target="_blank" rel="noopener noreferrer">
              {reference.sourceLabel}
              <span aria-hidden="true"> ↗</span>
              <span className="mobile-shelf__visually-hidden"> for {product.name}, opens in a new tab</span>
            </a>
          </>
        ) : product.kind === "drink" ? (
          <p>Serving prices are estimates and vary by state, shop and venue. Edit the price to record what you paid.</p>
        ) : (
          <p>This exact variant has no verified current pack price. The amount above is a logging estimate; edit it to match your shop.</p>
        )}
      </div>
    </details>
  );
}

export function MobileShelf({ kind, user, pending, savingProduct=null, savedProduct=null, onQuickLog, onDetailedLog, onEditFavorites, onEditUsualPrice }: MobileShelfProps) {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const helpId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const favorites = (user?.favoriteIds ?? []).map(id => CATALOG.find(product => product.id === id)).filter(product => product?.kind === kind);
  const products = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase("en-IN").split(/\s+/).filter(Boolean);
    return CATALOG.filter((product) => {
      if (product.kind !== kind) return false;
      const searchable = `${product.name} ${product.brand} ${product.variant}`.toLocaleLowerCase("en-IN");
      return terms.every((term) => searchable.includes(term));
    });
  }, [kind, query]);

  function clearSearch() {
    setQuery("");
    searchRef.current?.focus();
  }

  return (
    <section className="mobile-shelf" aria-label={`${kind === "cig" ? "Cigarette" : "Drink"} shelf`}>
      <button type="button" className="mobile-shelf__manage" onClick={onEditFavorites} disabled={pending}><span className="mobile-shelf__manage-icon" aria-hidden="true"><Star size={18}/></span><span><strong>Edit favorites</strong><small>{user ? `${favorites.length} of 3 on your home shelf · choose & arrange` : "Choose your brands. Save them to your account."}</small></span><ChevronRight size={17} aria-hidden="true"/></button>
      <p id={helpId} className="mobile-shelf__intro">
        Tap + to log one. Change the price or quantity below.
      </p>

      <div className="mobile-shelf__search">
        <label htmlFor={searchId} className="mobile-shelf__visually-hidden">Search brand or variant</label>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <circle cx="8.8" cy="8.8" r="5.6" />
          <path d="m13 13 4 4" strokeLinecap="round" />
        </svg>
        <input
          id={searchId}
          ref={searchRef}
          type="search"
          name="shelf-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search brand or variant"
          autoComplete="off"
          enterKeyHint="search"
          aria-describedby={helpId}
        />
        {query && (
          <button type="button" className="mobile-shelf__clear" onClick={clearSearch} aria-label="Clear search">
            <CloseIcon />
          </button>
        )}
      </div>

      <div className="mobile-shelf__list-heading">
        <span>{kind === "cig" ? "Cigarettes" : "Drinks"}</span>
        <span role="status" aria-live="polite" aria-atomic="true">
          {pending ? "Saving…" : `${products.length} ${products.length === 1 ? "item" : "items"}`}
        </span>
      </div>

      {products.length ? (
        <ul className="mobile-shelf__list" aria-busy={pending}>
          {products.map((product) => {
            const reference = getPriceReference(product.id);
            const override = user?.priceOverrides[product.id];
            const hasOverride = override !== undefined && Number.isFinite(override) && override >= 0;
            const price = hasOverride
              ? override
              : product.kind === "cig"
                ? suggestedLoosePrice(product.id, user?.defaultPrice ?? 25)
                : displayCost(product);
            const unit = unitLabel(product);
            const priceHint = hasOverride ? "Your saved price" : product.kind === "drink" ? "Serving estimate" : "Suggested price";

            return (
              <li className="mobile-shelf__item" key={product.id} data-product-id={product.id}>
                <div className="mobile-shelf__row">
                  <button
                    type="button"
                    className="mobile-shelf__product"
                    disabled={pending}
                    onClick={event => onQuickLog(product.id, objectOrigin(event.currentTarget))}
                    aria-label={`Log one ${product.name}, ${unit}, at ${fmtINR(price)}`}
                  >
                    <span className="mobile-shelf__art" aria-hidden="true">
                      <ProductShot product={product} size="sm" />
                    </span>
                    <span className="mobile-shelf__product-copy">
                      <span className="mobile-shelf__name">{product.name}</span>
                      <span className="mobile-shelf__variant">{product.variant}</span>
                      <span className="mobile-shelf__price">
                        <strong>{fmtINR(price)}</strong><span> / {unit}</span>
                      </span>
                      <span className="mobile-shelf__price-hint">{priceHint}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="mobile-shelf__add"
                    aria-label={savingProduct===product.id?`Saving ${product.name}`:`Log one ${product.name} at ${fmtINR(price)}`}
                    aria-busy={savingProduct===product.id}
                    disabled={pending}
                    onClick={event => onQuickLog(product.id, objectOrigin(event.currentTarget))}
                  >
                    <ActionMark state={savingProduct===product.id?"saving":savedProduct===product.id?"saved":"ready"}/>
                  </button>
                </div>
                <div className="mobile-shelf__row-details">
                  <button type="button" className="mobile-shelf__edit" disabled={pending} onClick={()=>onEditUsualPrice(product.id)} aria-label={`Usual price for ${product.name}`}>Usual price</button>
                  <button
                    type="button"
                    className="mobile-shelf__edit"
                    disabled={pending}
                    onClick={() => onDetailedLog(product.id)}
                    aria-label={`Log with details for ${product.name}: price or quantity`}
                  >
                    Log with details
                  </button>
                  <PriceDetails product={product} reference={reference} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mobile-shelf__empty">
          <h3>No matches this time.</h3>
          <p>Try a different brand or variant.</p>
          <button type="button" onClick={clearSearch}>Clear search</button>
        </div>
      )}
    </section>
  );
}

export default MobileShelf;
