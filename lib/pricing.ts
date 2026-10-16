/** Date these public references were checked; this is not an effective-from date. */
export const PRICE_CHECKED_AT = "2026-10-16";

export type PriceReference = {
  /** All amounts are Indian rupees, inclusive of taxes where the retailer states so. */
  packPrice: number;
  packSize: number;
  unitPrice: number;
  sourceUrl: string;
  sourceLabel: string;
  sourceDate?: string;
  checkedAt: string;
};

type ReferenceInput = Omit<PriceReference, "unitPrice" | "checkedAt">;

const ZEPTO = {
  sourceUrl:
    "https://www.zepto.com/cn/paan-corner/paan-corner/cid/0000e51e-00a3-4b01-910a-543a59692629/scid/5e64fda1-3037-411f-a408-41019e4cc23f",
  sourceLabel: "Zepto pack listing",
  sourceDate: "2026-09-14",
};

const BLINKIT = {
  sourceUrl: "https://blinkit.com/prn/marlboro-gold-advance/prid/498307",
  sourceLabel: "Blinkit pack listing",
};

const SEPTEMBER_UPDATE = {
  sourceUrl:
    "https://www.icicidirect.com/research/equity/blog/itc-took-another-round-of-price-in-its-cigarette-portfolio-in-sept-26",
  sourceLabel: "ICICI Direct September price report",
  sourceDate: "2026-09-25",
};

/**
 * References are variant-specific pack observations, not a national live price feed.
 * No entry means the exact catalogue variant has no supported current reference.
 */
const REFERENCES: Record<string, ReferenceInput> = {
  "classic-milds": { ...ZEPTO, packPrice: 480, packSize: 20 },
  "classic-ultra-milds": { ...ZEPTO, packPrice: 480, packSize: 20 },
  "classic-regular": {
    sourceUrl: "https://blinkit.com/prn/classic-rich-taste-regular/prid/479279",
    sourceLabel: "Blinkit Classic Rich Taste pack listing",
    packPrice: 480,
    packSize: 20,
  },
  "classic-iceburst": { ...ZEPTO, packPrice: 480, packSize: 20 },
  "classic-double-burst": {
    sourceUrl:
      "https://www.zepto.com/pn/classic-double-burst-cigarette/pvid/c3ca25e5-f3e6-43d3-950a-9aa8dc5d6e89",
    sourceLabel: "Zepto Classic Double Burst pack listing",
    packPrice: 480,
    packSize: 20,
  },
  "classic-connect": { ...SEPTEMBER_UPDATE, packPrice: 428, packSize: 20 },
  "gold-flake-kings": {
    sourceUrl: "https://www.topintownstore.com/product/gold-flake-kings-10-sticks/",
    sourceLabel: "Top in Town pack listing",
    packPrice: 240,
    packSize: 10,
  },
  "gold-flake-lights": { ...ZEPTO, packPrice: 240, packSize: 10 },
  "gold-flake-premium": { ...SEPTEMBER_UPDATE, packPrice: 135, packSize: 10 },
  "gold-flake-superstar": { ...SEPTEMBER_UPDATE, packPrice: 89, packSize: 10 },
  "gold-flake-filter": {
    sourceUrl:
      "https://www.zepto.com/pn/gold-flake-filter-cigarette/pvid/05776d06-bbbe-4344-91a3-e6e78118529d",
    sourceLabel: "Zepto Gold Flake Filter pack listing",
    packPrice: 127,
    packSize: 10,
  },
  "gold-flake-indie-mint": {
    sourceUrl:
      "https://www.zepto.com/pn/gold-flake-indie-mint-cigarette/pvid/07af35f5-b03b-42bc-9a67-bd84787d691d",
    sourceLabel: "Zepto Gold Flake Indie Mint pack listing",
    packPrice: 125,
    packSize: 10,
  },
  "marlboro-advance": { ...BLINKIT, packPrice: 240, packSize: 10 },
  "marlboro-red": {
    sourceUrl: "https://blinkit.com/prn/marlboro-red/prid/479274",
    sourceLabel: "Blinkit Marlboro Red pack listing",
    packPrice: 240,
    packSize: 10,
  },
  "marlboro-compact": { ...BLINKIT, packPrice: 122, packSize: 10 },
  "marlboro-double-switch": { ...ZEPTO, packPrice: 480, packSize: 20 },
  "wills-navy-cut": {
    sourceUrl:
      "https://informistmedia.com/EquityWire/59304/Cigarettes-companies-step-up-quick-commerce-play-to-counter-falling-sales",
    sourceLabel: "Informist Navy Cut pack report",
    sourceDate: "2026-09-08",
    packPrice: 140,
    packSize: 10,
  },
};

const PREMIUM_LOOSE_ESTIMATES = new Set([
  "classic-milds",
  "classic-ultra-milds",
  "classic-regular",
  "classic-iceburst",
  "classic-double-burst",
  "gold-flake-kings",
  "gold-flake-lights",
  "marlboro-advance",
  "marlboro-red",
  "marlboro-double-switch",
]);

export function getPriceReference(productId: string): PriceReference | null {
  const reference = Object.hasOwn(REFERENCES, productId) ? REFERENCES[productId] : null;
  if (!reference) return null;
  return {
    ...reference,
    unitPrice: Math.round((reference.packPrice / reference.packSize) * 100) / 100,
    checkedAt: PRICE_CHECKED_AT,
  };
}

/**
 * Editable suggestion for a new log, never a claim about a shop's loose-stick price.
 * Store the actual price on that log so catalogue updates cannot change old spend.
 * Drinks should continue to use displayCost(product), labelled as estimates.
 */
export function suggestedLoosePrice(productId: string, defaultPrice = 25): number {
  const fallback = Number.isFinite(defaultPrice) && defaultPrice >= 0 ? defaultPrice : 25;
  if (PREMIUM_LOOSE_ESTIMATES.has(productId)) return fallback;
  return getPriceReference(productId)?.unitPrice ?? fallback;
}
