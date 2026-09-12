"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  CATALOG,
  DEFAULT_DRINK_FAVORITES,
  DEFAULT_FAVORITES,
  LIFE_MIN_PER_CIG,
  PREV_DEFAULT_DRINK_FAVORITES,
  PREV_DEFAULT_FAVORITES,
  displayCost,
  isSpiritPeg,
  productById,
  spiritKcal,
  stdDrinks,
} from "@/lib/catalog";
import { getDb } from "@/lib/db";
import { events, products, settings, type EventRow } from "@/lib/schema";
import { cityFromTimezone, dayPart, getZonedParts } from "@/lib/time";
import type { ClientEvent, TrackerPayload } from "@/lib/types";

function serialize(e: EventRow): ClientEvent {
  return {
    ...e,
    loggedAt: new Date(e.loggedAt).toISOString(),
    createdAt: new Date(e.createdAt).toISOString(),
    localDate: String(e.localDate),
  };
}

export async function ensureSeed() {
  const db = getDb();
  const existing = await db.select({ id: settings.id }).from(settings).where(eq(settings.id, 1)).limit(1);
  if (existing.length === 0) {
    await db.insert(settings).values({
      id: 1,
      cigBaseline: 8,
      drinkBaseline: 2,
      timezone: "Asia/Kolkata",
      favoriteIds: DEFAULT_FAVORITES,
      drinkFavoriteIds: DEFAULT_DRINK_FAVORITES,
    }).onConflictDoNothing();
  }
  const currentSettings = (await db.select().from(settings).where(eq(settings.id, 1)).limit(1))[0];
  if (currentSettings) {
    const cigSame = JSON.stringify(currentSettings.favoriteIds) === JSON.stringify(PREV_DEFAULT_FAVORITES);
    const drinkSame = JSON.stringify(currentSettings.drinkFavoriteIds) === JSON.stringify(PREV_DEFAULT_DRINK_FAVORITES);
    if (cigSame || drinkSame) {
      await db
        .update(settings)
        .set({
          favoriteIds: cigSame ? DEFAULT_FAVORITES : currentSettings.favoriteIds,
          drinkFavoriteIds: drinkSame ? DEFAULT_DRINK_FAVORITES : currentSettings.drinkFavoriteIds,
        })
        .where(eq(settings.id, 1));
    }
  }
  const existingProducts = await db.select({
    id: products.id,
    packPrice: products.packPrice,
    standardDrinks: products.standardDrinks,
  }).from(products);
  const red = productById("marlboro-red");
  const monk = productById("old-monk");
  const priced = existingProducts.find((r) => r.id === "marlboro-red");
  const monkRow = existingProducts.find((r) => r.id === "old-monk");
  if (
    existingProducts.length >= CATALOG.length &&
    priced?.packPrice === red.packPrice &&
    monkRow?.standardDrinks === monk.standardDrinks
  ) return;
  await db
    .insert(products)
    .values(CATALOG)
    .onConflictDoUpdate({
      target: products.id,
      set: {
        kind: sql`excluded.kind`,
        name: sql`excluded.name`,
        brand: sql`excluded.brand`,
        variant: sql`excluded.variant`,
        manufacturer: sql`excluded.manufacturer`,
        packPrice: sql`excluded.pack_price`,
        unitsPerPack: sql`excluded.units_per_pack`,
        unitName: sql`excluded.unit_name`,
        tarMg: sql`excluded.tar_mg`,
        nicotineMg: sql`excluded.nicotine_mg`,
        coMg: sql`excluded.co_mg`,
        lengthMm: sql`excluded.length_mm`,
        filter: sql`excluded.filter`,
        strength: sql`excluded.strength`,
        flavor: sql`excluded.flavor`,
        abv: sql`excluded.abv`,
        volumeMl: sql`excluded.volume_ml`,
        standardDrinks: sql`excluded.standard_drinks`,
        calories: sql`excluded.calories`,
        origin: sql`excluded.origin`,
        fact: sql`excluded.fact`,
        artKey: sql`excluded.art_key`,
        body: sql`excluded.body`,
        band: sql`excluded.band`,
        foil: sql`excluded.foil`,
      },
    });
}

export async function loadTracker(): Promise<TrackerPayload> {
  await ensureSeed();
  const db = getDb();
  const [rows, settingRows] = await Promise.all([
    db.select().from(events),
    db.select().from(settings).where(eq(settings.id, 1)).limit(1),
  ]);
  const s = settingRows[0];
  return {
    events: rows.map(serialize),
    favorites: s?.favoriteIds ?? DEFAULT_FAVORITES,
    drinkFavorites: s?.drinkFavoriteIds ?? DEFAULT_DRINK_FAVORITES,
    cigBaseline: s?.cigBaseline ?? 8,
    drinkBaseline: s?.drinkBaseline ?? 2,
    timezone: s?.timezone ?? "Asia/Kolkata",
    city: s?.city ?? "",
  };
}

export async function logHit(input: {
  productId: string;
  timezone: string;
  source: "shelf" | "picker" | "bottle";
  city?: string;
}) {
  const p = productById(input.productId);
  const now = new Date();
  const tz = input.timezone || "Asia/Kolkata";
  const z = getZonedParts(now, tz);
  const bottle = input.source === "bottle";
  const qty = 1;
  const volume = bottle && isSpiritPeg(p) ? 750 : p.volumeMl;
  const std = bottle && p.abv && volume ? stdDrinks(volume, p.abv) : p.standardDrinks;
  const cal = bottle && p.abv && volume ? spiritKcal(volume, p.abv) : p.calories;
  const db = getDb();
  const inserted = await db
    .insert(events)
    .values({
      kind: p.kind,
      productId: p.id,
      productName: bottle ? `${p.name} bottle` : p.name,
      brand: p.brand,
      variant: p.variant,
      manufacturer: p.manufacturer,
      loggedAt: now,
      timezone: tz,
      localDate: z.localDate,
      localTime: z.localTime,
      weekday: z.weekday,
      hour: z.hour,
      minute: z.minute,
      isoWeek: z.isoWeek,
      month: z.month,
      year: z.year,
      quantity: qty,
      unitCostInr: bottle ? p.packPrice : displayCost(p),
      nicotineMg: p.nicotineMg,
      tarMg: p.tarMg,
      coMg: p.coMg,
      lifeMinutes: p.kind === "cig" ? LIFE_MIN_PER_CIG * qty : 0,
      abv: p.abv,
      volumeMl: volume,
      standardDrinks: std,
      calories: cal,
      source: input.source,
      packPriceInr: p.packPrice,
      unitsPerPack: p.unitsPerPack,
      lengthMm: p.lengthMm,
      strength: p.strength,
      flavor: p.flavor,
      dayPart: dayPart(z.hour),
      city: input.city?.trim() || cityFromTimezone(tz),
    })
    .returning();
  return serialize(inserted[0]);
}

export async function undoHit(id: string) {
  const db = getDb();
  await db.delete(events).where(eq(events.id, id));
}

export async function saveSettings(input: {
  cigBaseline?: number;
  drinkBaseline?: number;
  favoriteIds?: string[];
  drinkFavoriteIds?: string[];
  timezone?: string;
  city?: string;
}) {
  const db = getDb();
  const current = (await db.select().from(settings).where(eq(settings.id, 1)).limit(1))[0];
  await db
    .update(settings)
    .set({
      cigBaseline: input.cigBaseline ?? current?.cigBaseline ?? 8,
      drinkBaseline: input.drinkBaseline ?? current?.drinkBaseline ?? 2,
      favoriteIds: input.favoriteIds ?? current?.favoriteIds ?? DEFAULT_FAVORITES,
      drinkFavoriteIds: input.drinkFavoriteIds ?? current?.drinkFavoriteIds ?? DEFAULT_DRINK_FAVORITES,
      timezone: input.timezone ?? current?.timezone ?? "Asia/Kolkata",
      city: input.city ?? current?.city ?? "",
    })
    .where(eq(settings.id, 1));
  revalidatePath("/");
}
