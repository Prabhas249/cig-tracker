# Price references

Checked **16 October 2026**. These are observed Indian pack listings or dated price reports, not a live nationwide price feed. Check the printed pack price and enter what you actually paid. Locations, variants, stock batches and retailers can differ.

## Supported catalogue entries

| Exact catalogue variant | Reference pack | Per stick | Evidence |
| --- | ---: | ---: | --- |
| Classic Milds / Balanced Taste | ₹480 / 20 | ₹24 | [Zepto catalogue](https://www.zepto.com/cn/paan-corner/paan-corner/cid/0000e51e-00a3-4b01-910a-543a59692629/scid/5e64fda1-3037-411f-a408-41019e4cc23f) |
| Classic Ultra Milds / Refined Taste | ₹480 / 20 | ₹24 | Same Zepto listing |
| Classic Regular / Rich Taste | ₹480 / 20 | ₹24 | [Blinkit exact variant](https://blinkit.com/prn/classic-rich-taste-regular/prid/479279) |
| Classic Ice Burst | ₹480 / 20 | ₹24 | [Blinkit related packs](https://blinkit.com/prn/classic-ice-burst/prid/493089), Zepto catalogue |
| Classic Double Burst | ₹480 / 20 | ₹24 | [Zepto exact pack](https://www.zepto.com/pn/classic-double-burst-cigarette/pvid/c3ca25e5-f3e6-43d3-950a-9aa8dc5d6e89) |
| Gold Flake Kings | ₹240 / 10 | ₹24 | [Top in Town exact pack](https://www.topintownstore.com/product/gold-flake-kings-10-sticks/), Zepto catalogue |
| Gold Flake Lights / King's Blue | ₹240 / 10 | ₹24 | Zepto catalogue |
| Marlboro Advance | ₹240 / 10 | ₹24 | [Blinkit listed variant](https://blinkit.com/prn/marlboro-gold-advance/prid/498307) |
| Marlboro Red | ₹240 / 10 | ₹24 | [Blinkit exact variant](https://blinkit.com/prn/marlboro-red/prid/479274) |
| Marlboro Fuse Beyond / Double Switch | ₹480 / 20 | ₹24 | Zepto catalogue |
| Marlboro Advance Compact | ₹122 / 10 | ₹12.20 | Blinkit listed variant; also Zepto catalogue |
| Gold Flake Filter | ₹127 / 10 | ₹12.70 | [Zepto exact pack](https://www.zepto.com/pn/gold-flake-filter-cigarette/pvid/05776d06-bbbe-4344-91a3-e6e78118529d) |
| Gold Flake Indie Mint | ₹125 / 10 | ₹12.50 | [Zepto exact pack](https://www.zepto.com/pn/gold-flake-indie-mint-cigarette/pvid/07af35f5-b03b-42bc-9a67-bd84787d691d), [Blinkit exact pack](https://blinkit.com/prn/gold-flake-indie-mint/prid/522645) |
| Wills Navy Cut, original | ₹140 / 10 | ₹14 | [Informist, 8 September 2026](https://informistmedia.com/EquityWire/59304/Cigarettes-companies-step-up-quick-commerce-play-to-counter-falling-sales) |
| Classic Connect | ₹428 / 20 | ₹21.40 | [ICICI Direct, 25 September 2026](https://www.icicidirect.com/research/equity/blog/itc-took-another-round-of-price-in-its-cigarette-portfolio-in-sept-26), corroborated by Blinkit's Ice Burst related-pack listing |
| Gold Flake Premium | ₹135 / 10 | ₹13.50 | Same September ICICI Direct report |
| Gold Flake Super Star | ₹89 / 10 | ₹8.90 | Same September ICICI Direct report |

The Zepto October cigarette catalogue, last updated 12 October 2026, also lists [Filter ₹127 and Indie Mint ₹125 with their pack counts](https://www.zepto.com/cn/paan-corner/cigarettes/cid/cd50825e-baf8-47fe-9abc-ed9556122a9a/scid/5bcbee47-7c83-4279-80f0-7ecc068496df?cart=open).

## Conflicts and limits

- Older listings still show Classic Connect ₹390, Super Star ₹79 and Premium ₹125. Use the later dated September report for these references. Some retailer pages contain stale prose alongside newer product cards; this is why the app stores provenance and calls these references.
- Indie Mint ₹115 appears on an older related-product listing. Exact Zepto and Blinkit pages currently show ₹125/10. The exact Filter page shows ₹127/10. Filter and Premium remain separate catalogue entries rather than silently assuming they are interchangeable.
- ₹25 is an **editable loose-stick estimate** for supported full-size premium variants whose reference pack math is ₹24. It reflects the user's stated local price, not an independently verified all-India loose-stick price. Compact, value and other supported entries start from their pack-derived reference.
- Unknown or unverified cigarette variants have no `PriceReference`; `suggestedLoosePrice(id, defaultPrice)` returns the user's default estimate. Legacy catalogue amounts remain available for compatibility and must not be described as verified MRP.
- Pack listings marked inclusive of taxes already include applicable taxes. The app must not add GST again.
- Drink amounts remain **unverified serving-cost estimates**. No state-specific 2026 MRP verification is claimed. Bottle, serving size, ABV and calories should be checked against the actual product.
- Unsourced cigarette tar, nicotine and carbon monoxide figures were removed. Variant names such as “mild” and “lights” must not be treated as measurements or comparative health claims.

## Integration contract

`lib/pricing.ts` exports `PRICE_CHECKED_AT`, `getPriceReference(productId)` and `suggestedLoosePrice(productId, defaultPrice = 25)`. Values are rupees. References include the observed pack amount and quantity, derived per-stick amount, source URL, source label, optional source publication date and check date. A check date is not an effective-from date.

Use the suggested amount only when creating a log. Persist the actual paid price on each log and retain it when catalogue defaults change; never recalculate historical spending from today's catalogue. `displayCost(product)` continues to provide drink estimates and pack-derived cigarette amounts for older components. `ProductDef` retains its original fields.
