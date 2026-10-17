import { createHash, randomUUID } from "node:crypto";
import { CATALOG, displayCost, isSpiritPeg, spiritKcal, stdDrinks } from "./catalog";
import { suggestedLoosePrice } from "./pricing";
import { cityFromTimezone, dayPart, getZonedParts } from "./time";
import type { FriendSummary, SocialEvent, TrackerState, User } from "./social-types";
import type { StoreInput } from "./store-types";

export class StoreError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = "StoreError"; }
}
export const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
export function emptyState(): TrackerState { return { user: null, events: [], friends: [], requests: [], sentRequests: [] }; }
export function hashToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }
export function text(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== "string") throw new StoreError(`${label} is required.`);
  const result = value.trim();
  if (result.length < min || result.length > max || /[\u0000-\u001f\u007f]/.test(result)) throw new StoreError(`${label} must be ${min === 0 ? "at most" : `${min}–`} ${max} characters.`);
  return result;
}
export function number(value: unknown, label: string, min: number, max: number, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new StoreError(`${label} must be ${integer ? "a whole number " : "a number "}between ${min} and ${max}.`);
  return value;
}
export function price(value: unknown, label = "Price"): number {
  const result = number(value, label, 0, 100000);
  if (Math.abs(result * 100 - Math.round(result * 100)) > 0.000001) throw new StoreError(`${label} can have at most two decimal places.`);
  return Math.round(result * 100) / 100;
}
export function username(value: unknown): string {
  const handle = text(value, "Username", 3, 24).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_]{2,23}$/.test(handle)) throw new StoreError("Use 3–24 letters, numbers or underscores for your username.");
  return handle;
}
export function password(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) throw new StoreError("Use a password with 8–128 characters.");
  return value;
}
export function timezone(value: unknown): string {
  const zone = text(value, "Timezone", 1, 80);
  try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(); } catch { throw new StoreError("Choose a valid timezone."); }
  return zone;
}
function object(value: unknown, label: string): StoreInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new StoreError(`${label} must be an object.`);
  return value as StoreInput;
}
export function settingsFor(user: User, input: StoreInput): User {
  const next = { ...user };
  if (input.name !== undefined) next.name = text(input.name, "Name", 1, 60);
  if (input.city !== undefined) next.city = text(input.city, "City", 0, 100);
  if (input.timezone !== undefined) next.timezone = timezone(input.timezone);
  if (input.cigBaseline !== undefined) next.cigBaseline = number(input.cigBaseline, "Cigarette baseline", 0, 200, true);
  if (input.drinkBaseline !== undefined) next.drinkBaseline = number(input.drinkBaseline, "Drink baseline", 0, 100, true);
  if (input.dailyLimit !== undefined) next.dailyLimit = number(input.dailyLimit, "Daily limit", 0, 200, true);
  if (input.defaultPrice !== undefined) next.defaultPrice = price(input.defaultPrice, "Default price");
  if (input.sharing !== undefined) {
    if (input.sharing !== "summary" && input.sharing !== "activity" && input.sharing !== "private") throw new StoreError("Choose summary, cigarette details, or private sharing.");
    next.sharing = input.sharing;
  }
  if (input.priceOverrides !== undefined) {
    const overrides = object(input.priceOverrides, "Price overrides");
    if (Object.keys(overrides).length > CATALOG.length) throw new StoreError("Too many price overrides.");
    next.priceOverrides = {};
    for (const [id, amount] of Object.entries(overrides)) {
      if (!CATALOG.some(product => product.id === id)) throw new StoreError("Unknown product in price overrides.");
      next.priceOverrides[id] = price(amount);
    }
  }
  if (input.favoriteIds !== undefined) {
    if (!Array.isArray(input.favoriteIds) || input.favoriteIds.length > 12 || input.favoriteIds.some(id => typeof id !== "string" || !CATALOG.some(product => product.id === id))) throw new StoreError("Choose up to 12 products from the catalog.");
    next.favoriteIds = [...new Set(input.favoriteIds as string[])];
  }
  return next;
}

export function eventFor(user: User, input: StoreInput) {
  const id = text(input.productId, "Product", 1, 80);
  const product = CATALOG.find(item => item.id === id);
  if (!product) throw new StoreError("Choose a product from the catalog.");
  const quantity = input.quantity === undefined ? 1 : number(input.quantity, "Quantity", .25, 100, product.kind === "cig");
  if (product.kind === "drink" && !Number.isInteger(quantity * 4)) throw new StoreError("Drink quantities use quarter-serving steps.");
  const source = input.source === undefined ? "manual" : text(input.source, "Source", 1, 20);
  if (!["manual", "shelf", "picker", "bottle"].includes(source)) throw new StoreError("Choose a valid entry source.");
  if (source === "bottle" && product.kind !== "drink") throw new StoreError("Bottle purchases are only available for drinks.");
  const unitCostInr = input.unitCostInr === undefined ? source === "bottle" ? product.packPrice : user.priceOverrides[id] ?? (product.kind === "cig" ? suggestedLoosePrice(id, user.defaultPrice) : displayCost(product)) : price(input.unitCostInr);
  const note = input.note === undefined ? "" : text(input.note, "Note", 0, 280);
  let loggedAt = new Date();
  if (input.loggedAt !== undefined) {
    const value = text(input.loggedAt, "Date", 1, 50);
    const match = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
    if (!match) throw new StoreError("Choose a valid date and time with a timezone.");
    const calendarDate = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== value.slice(0, 10)) throw new StoreError("Choose a valid calendar date.");
    loggedAt = new Date(value);
    if (!Number.isFinite(loggedAt.getTime()) || loggedAt.getTime() < Date.UTC(2000, 0, 1) || loggedAt.getTime() > Date.now() + 60000) throw new StoreError("Entry dates must be between 2000 and now.");
  }
  const requestId = input.requestId === undefined ? null : text(input.requestId, "Request ID", 36, 36).toLowerCase();
  if (requestId && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId)) throw new StoreError("Use a valid request ID.");
  const zoned = getZonedParts(loggedAt, user.timezone);
  const bottle = source === "bottle";
  const volume = bottle && isSpiritPeg(product) ? 750 : product.volumeMl;
  const event: SocialEvent = {
    id: randomUUID(), kind: product.kind, productId: product.id, productName: bottle ? `${product.name} bottle` : product.name,
    brand: product.brand, variant: product.variant, manufacturer: product.manufacturer,
    loggedAt: loggedAt.toISOString(), createdAt: new Date().toISOString(), timezone: user.timezone,
    localDate: zoned.localDate, localTime: zoned.localTime, weekday: zoned.weekday, hour: zoned.hour, minute: zoned.minute,
    isoWeek: zoned.isoWeek, month: zoned.month, year: zoned.year, quantity, unitCostInr,
    nicotineMg: product.nicotineMg, tarMg: product.tarMg, coMg: product.coMg, lifeMinutes: null,
    abv: product.abv, volumeMl: volume, standardDrinks: bottle && product.abv && volume ? stdDrinks(volume, product.abv) : product.standardDrinks,
    calories: bottle && product.abv && volume ? spiritKcal(volume, product.abv) : product.calories,
    source, packPriceInr: product.packPrice, unitsPerPack: product.unitsPerPack, lengthMm: product.lengthMm,
    strength: product.strength, flavor: product.flavor, dayPart: dayPart(zoned.hour), city: user.city || cityFromTimezone(user.timezone),
    ...(note ? { note } : {}), ...(requestId ? { requestId } : {}),
  };
  const payloadHash = hashToken(JSON.stringify([id, quantity, input.unitCostInr === undefined ? null : unitCostInr, input.loggedAt === undefined ? null : loggedAt.toISOString(), note, source]));
  return { event, requestId, payloadHash };
}

export type FriendCig = Pick<SocialEvent, "id" | "productId" | "productName" | "quantity" | "loggedAt" | "unitCostInr">;
export function friendData(friend: User, rows: FriendCig[], now: Date): Pick<FriendSummary, "stats" | "activity"> {
  if (friend.sharing !== "summary" && friend.sharing !== "activity") return { stats: null, activity: null };
  const today = getZonedParts(now, friend.timezone).localDate;
  const dates = Array.from({ length: 7 }, (_, i) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i - 6); return d.toISOString().slice(0, 10); });
  const counts = new Map(dates.map(date => [date, 0]));
  let weekSpend = 0;
  const entries = [];
  for (const row of rows) {
    const local = getZonedParts(new Date(row.loggedAt), friend.timezone);
    if (counts.has(local.localDate)) { counts.set(local.localDate, (counts.get(local.localDate) ?? 0) + row.quantity); weekSpend += row.quantity * row.unitCostInr; }
    if (friend.sharing === "activity" && local.localDate === today) entries.push({ id: row.id, productId: row.productId, productName: row.productName, quantity: row.quantity, loggedAt: row.loggedAt, localDate: local.localDate, localTime: local.localTime });
  }
  const weeklyCounts = dates.map(date => counts.get(date) ?? 0);
  return { stats: { todayCigs: counts.get(today) ?? 0, weekCigs: weeklyCounts.reduce((sum, n) => sum + n, 0), weekSpend: Math.round(weekSpend * 100) / 100, lastLoggedAt: rows[0]?.loggedAt ?? null, dailyLimit: friend.dailyLimit, weeklyCounts },
    activity: friend.sharing === "activity" ? { today: entries.slice(0, 50), timezone: friend.timezone, truncated: entries.length > 50 } : null };
}

export type RevisionPeer = { profile: User; activityRevision: string | number };
export function revisionFor(user: User, ownRevision: string | number, peers: RevisionPeer[], identities: unknown[], now: Date): string {
  const visible = peers.map(({ profile: peer, activityRevision }) => [peer.id, peer.name, peer.username, peer.sharing,
    peer.sharing === "summary" || peer.sharing === "activity" ? [peer.dailyLimit, peer.timezone, String(activityRevision), getZonedParts(now, peer.timezone).localDate] : null]);
  return hashToken(JSON.stringify([user.id, String(ownRevision), getZonedParts(now, user.timezone).localDate, visible, identities])).slice(0, 32);
}
