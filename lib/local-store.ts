import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { CATALOG, DEFAULT_FAVORITES, displayCost, isSpiritPeg, spiritKcal, stdDrinks } from "./catalog";
import { suggestedLoosePrice } from "./pricing";
import { cityFromTimezone, dayPart, getZonedParts } from "./time";
import type { FriendRequest, FriendSummary, SocialEvent, TrackerState, User } from "./social-types";
import { StoreError } from "./store-common";
export { StoreError } from "./store-common";

// Keep the sqlite interface local: the app also supports the bundled Node runtime,
// whose version may be newer than the project's @types/node package.
type SqlValue = string | number | null;
type SqlRow = Record<string, SqlValue>;
type Statement = {
  run: (...values: SqlValue[]) => { changes: number | bigint };
  get: (...values: SqlValue[]) => SqlRow | undefined;
  all: (...values: SqlValue[]) => SqlRow[];
};
type Sqlite = { exec: (sql: string) => void; prepare: (sql: string) => Statement; close: () => void };
// process.getBuiltinModule avoids a bundler rewriting this new Node builtin into
// a package reference. It is provided by the Node runtime used for the local app.
const runtimeProcess = process as typeof process & { getBuiltinModule: (id: string) => unknown };
const { DatabaseSync } = runtimeProcess.getBuiltinModule("node:sqlite") as { DatabaseSync: new (path: string) => Sqlite };
const deriveKey = promisify(scrypt);
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const EMPTY_STATE: TrackerState = { user: null, events: [], friends: [], requests: [], sentRequests: [] };

type Input = Record<string, unknown>;
export type MutationResult = { state: TrackerState; sessionToken?: string; clearSession?: boolean };

function text(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== "string") throw new StoreError(`${label} is required.`);
  const result = value.trim();
  if (result.length < min || result.length > max || /[\u0000-\u001f\u007f]/.test(result)) {
    throw new StoreError(`${label} must be ${min === 0 ? "at most" : `${min}–`} ${max} characters.`);
  }
  return result;
}

function number(value: unknown, label: string, min: number, max: number, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new StoreError(`${label} must be ${integer ? "a whole number " : "a number "}between ${min} and ${max}.`);
  }
  return value;
}

function price(value: unknown, label = "Price"): number {
  const result = number(value, label, 0, 100000);
  if (Math.abs(result * 100 - Math.round(result * 100)) > 0.000001) throw new StoreError(`${label} can have at most two decimal places.`);
  return Math.round(result * 100) / 100;
}

function username(value: unknown): string {
  const name = text(value, "Username", 3, 24).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_]{2,23}$/.test(name)) throw new StoreError("Use 3–24 letters, numbers or underscores for your username.");
  return name;
}

function password(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) throw new StoreError("Use a password with 8–128 characters.");
  return value;
}

function timezone(value: unknown): string {
  const zone = text(value, "Timezone", 1, 80);
  try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(); }
  catch { throw new StoreError("Choose a valid timezone."); }
  return zone;
}

function object(value: unknown, label: string): Input {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new StoreError(`${label} must be an object.`);
  return value as Input;
}

function hashToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }
function utcDateOffset(date: string, offset: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** One local database, with ownership enforced before every read or mutation. */
export class LocalStore {
  private db: Sqlite;

  constructor(directory = join(process.cwd(), "data")) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(directory, "ashtray.sqlite"));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        invite_code TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        profile_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
      CREATE TABLE IF NOT EXISTS tracker_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        logged_at TEXT NOT NULL,
        event_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_owner_date ON tracker_events(user_id, logged_at DESC);
      CREATE TABLE IF NOT EXISTS friendships (
        low_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        high_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        connected_at TEXT NOT NULL,
        PRIMARY KEY(low_id, high_id),
        CHECK(low_id < high_id)
      );
      CREATE TABLE IF NOT EXISTS friend_requests (
        id TEXT PRIMARY KEY,
        from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        low_id TEXT NOT NULL,
        high_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(low_id, high_id),
        CHECK(from_id <> to_id)
      );
      CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        reset_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS log_requests (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        request_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        event_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(user_id, request_id)
      );
      CREATE TABLE IF NOT EXISTS sync_revisions (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        own_revision INTEGER NOT NULL DEFAULT 0,
        activity_revision INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO sync_revisions(user_id) SELECT id FROM users;
      CREATE TRIGGER IF NOT EXISTS sync_user_insert_v1 AFTER INSERT ON users BEGIN
        INSERT OR IGNORE INTO sync_revisions(user_id) VALUES (NEW.id);
      END;
      CREATE TRIGGER IF NOT EXISTS sync_user_profile_v1 AFTER UPDATE OF profile_json ON users
      WHEN OLD.profile_json <> NEW.profile_json BEGIN
        UPDATE sync_revisions SET own_revision = own_revision + 1 WHERE user_id = NEW.id;
      END;
      CREATE TRIGGER IF NOT EXISTS sync_event_insert_v1 AFTER INSERT ON tracker_events BEGIN
        UPDATE sync_revisions SET own_revision = own_revision + 1,
          activity_revision = activity_revision + CASE WHEN json_extract(NEW.event_json, '$.kind') = 'cig' THEN 1 ELSE 0 END
          WHERE user_id = NEW.user_id;
      END;
      CREATE TRIGGER IF NOT EXISTS sync_event_delete_v1 AFTER DELETE ON tracker_events BEGIN
        UPDATE sync_revisions SET own_revision = own_revision + 1,
          activity_revision = activity_revision + CASE WHEN json_extract(OLD.event_json, '$.kind') = 'cig' THEN 1 ELSE 0 END
          WHERE user_id = OLD.user_id;
      END;
      CREATE TRIGGER IF NOT EXISTS sync_event_update_v1 AFTER UPDATE ON tracker_events BEGIN
        UPDATE sync_revisions SET own_revision = own_revision + 1,
          activity_revision = activity_revision + CASE WHEN json_extract(OLD.event_json, '$.kind') = 'cig' THEN 1 ELSE 0 END
          WHERE user_id = OLD.user_id;
        UPDATE sync_revisions SET own_revision = own_revision + 1,
          activity_revision = activity_revision + CASE WHEN json_extract(NEW.event_json, '$.kind') = 'cig' THEN 1 ELSE 0 END
          WHERE user_id = NEW.user_id;
      END;
      CREATE TRIGGER IF NOT EXISTS sync_request_insert_v1 AFTER INSERT ON friend_requests BEGIN
        UPDATE sync_revisions SET own_revision = own_revision + 1 WHERE user_id IN (NEW.from_id, NEW.to_id);
      END;
      CREATE TRIGGER IF NOT EXISTS sync_request_delete_v1 AFTER DELETE ON friend_requests BEGIN
        UPDATE sync_revisions SET own_revision = own_revision + 1 WHERE user_id IN (OLD.from_id, OLD.to_id);
      END;
      CREATE TRIGGER IF NOT EXISTS sync_connection_insert_v1 AFTER INSERT ON friendships BEGIN
        UPDATE sync_revisions SET own_revision = own_revision + 1 WHERE user_id IN (NEW.low_id, NEW.high_id);
      END;
      CREATE TRIGGER IF NOT EXISTS sync_connection_delete_v1 AFTER DELETE ON friendships BEGIN
        UPDATE sync_revisions SET own_revision = own_revision + 1 WHERE user_id IN (OLD.low_id, OLD.high_id);
      END;
    `);
  }

  close() { this.db.close(); }

  private transaction<T>(work: () => T, write = true): T {
    this.db.exec(write ? "BEGIN IMMEDIATE" : "BEGIN");
    try { const result = work(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  private byId(id: string): User | null {
    const row = this.db.prepare("SELECT profile_json FROM users WHERE id = ?").get(id);
    return row ? JSON.parse(String(row.profile_json)) as User : null;
  }

  private eventRows(userId: string): SocialEvent[] {
    return this.db.prepare("SELECT event_json FROM tracker_events WHERE user_id = ? ORDER BY logged_at DESC, id DESC")
      .all(userId).map((row) => JSON.parse(String(row.event_json)) as SocialEvent);
  }

  private sessionUser(token?: string): User | null {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const row = this.db.prepare("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?").get(hashToken(token), Date.now());
    return row ? this.byId(String(row.user_id)) : null;
  }

  private createSession(userId: string): string {
    const token = randomBytes(32).toString("base64url");
    this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
    this.db.prepare("INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .run(hashToken(token), userId, Date.now() + SESSION_MS);
    return token;
  }

  private limit(key: string, max: number, windowMs: number): void {
    this.transaction(() => {
      const now = Date.now();
      const hashed = hashToken(key);
      const current = this.db.prepare("SELECT count, reset_at FROM rate_limits WHERE key = ?").get(hashed);
      if (current && Number(current.reset_at) > now) {
        if (Number(current.count) >= max) throw new StoreError("Too many attempts. Please try again in a few minutes.", 429);
        this.db.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").run(hashed);
      } else {
        this.db.prepare("INSERT INTO rate_limits(key, count, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at")
          .run(hashed, now + windowMs);
      }
      this.db.prepare("DELETE FROM rate_limits WHERE reset_at < ?").run(now);
    });
  }

  private friendStats(friend: User, now = new Date()): FriendSummary["stats"] {
    if (friend.sharing !== "summary" && friend.sharing !== "activity") return null;
    const today = getZonedParts(now, friend.timezone).localDate;
    const dates = Array.from({ length: 7 }, (_, index) => utcDateOffset(today, index - 6));
    const counts = new Map(dates.map((date) => [date, 0]));
    let weekSpend = 0;
    const rows = this.eventRows(friend.id).filter((event) => event.kind === "cig");
    for (const row of rows) {
      const date = getZonedParts(new Date(row.loggedAt), friend.timezone).localDate;
      if (!counts.has(date)) continue;
      counts.set(date, (counts.get(date) ?? 0) + row.quantity);
      weekSpend += row.unitCostInr * row.quantity;
    }
    const weeklyCounts = dates.map((date) => counts.get(date) ?? 0);
    return {
      todayCigs: counts.get(today) ?? 0,
      weekCigs: weeklyCounts.reduce((sum, count) => sum + count, 0),
      weekSpend: Math.round(weekSpend * 100) / 100,
      lastLoggedAt: rows[0]?.loggedAt ?? null,
      dailyLimit: friend.dailyLimit,
      weeklyCounts,
    };
  }

  private friendActivity(friend: User, now = new Date()): FriendSummary["activity"] {
    if (friend.sharing !== "activity") return null;
    const today = getZonedParts(now, friend.timezone).localDate;
    const rows = this.eventRows(friend.id).flatMap((event) => {
      if (event.kind !== "cig") return [];
      const local = getZonedParts(new Date(event.loggedAt), friend.timezone);
      if (local.localDate !== today) return [];
      // Explicit allowlist: never spread a personal event into a friend response.
      return [{ id: event.id, productId: event.productId, productName: event.productName,
        quantity: event.quantity, loggedAt: event.loggedAt, localDate: local.localDate, localTime: local.localTime }];
    });
    return { today: rows.slice(0, 50), timezone: friend.timezone, truncated: rows.length > 50 };
  }

  private revisionForUser(user: User, now = new Date()): string {
    const own = this.db.prepare("SELECT own_revision FROM sync_revisions WHERE user_id = ?").get(user.id);
    const peers = this.db.prepare(`SELECT u.id, u.profile_json, r.activity_revision
      FROM friendships f JOIN users u ON u.id = CASE WHEN f.low_id = ? THEN f.high_id ELSE f.low_id END
      LEFT JOIN sync_revisions r ON r.user_id = u.id
      WHERE f.low_id = ? OR f.high_id = ? ORDER BY u.id`).all(user.id, user.id, user.id);
    const visiblePeers = peers.map((row) => {
      const peer = JSON.parse(String(row.profile_json)) as User;
      return [peer.id, peer.name, peer.username, peer.sharing, (peer.sharing === "summary" || peer.sharing === "activity")
        ? [peer.dailyLimit, peer.timezone, row.activity_revision ?? 0, getZonedParts(now, peer.timezone).localDate] : null];
    });
    // Pending connections expose identity only. Their private or shared activity
    // never changes the recipient's revision until the request is accepted.
    const pendingIdentities = this.db.prepare(`SELECT q.id,
      json_extract(u.profile_json, '$.name') AS name, u.username
      FROM friend_requests q JOIN users u ON u.id = CASE WHEN q.from_id = ? THEN q.to_id ELSE q.from_id END
      WHERE q.from_id = ? OR q.to_id = ? ORDER BY q.id`).all(user.id, user.id, user.id);
    return hashToken(JSON.stringify([user.id, own?.own_revision ?? 0,
      getZonedParts(now, user.timezone).localDate, visiblePeers, pendingIdentities])).slice(0, 32);
  }

  /** Cheap, authenticated invalidation token. No event bodies are loaded here. */
  syncRevision(token?: string): string | null {
    return this.transaction(() => {
      const user = this.sessionUser(token);
      return user ? this.revisionForUser(user) : null;
    }, false);
  }

  state(token?: string): TrackerState {
    return this.transaction(() => this.snapshot(token), false);
  }

  private snapshot(token?: string): TrackerState {
    const user = this.sessionUser(token);
    if (!user) return { ...EMPTY_STATE };
    const now = new Date();
    const connections = this.db.prepare("SELECT low_id, high_id, connected_at FROM friendships WHERE low_id = ? OR high_id = ? ORDER BY connected_at DESC")
      .all(user.id, user.id);
    const friends: FriendSummary[] = connections.flatMap((connection) => {
      const friendId = connection.low_id === user.id ? String(connection.high_id) : String(connection.low_id);
      const friend = this.byId(friendId);
      return friend ? [{ id: friend.id, name: friend.name, username: friend.username, sharing: friend.sharing,
        connectedAt: String(connection.connected_at), stats: this.friendStats(friend, now), activity: this.friendActivity(friend, now) }] : [];
    });
    const requests: FriendRequest[] = [];
    const sentRequests: FriendRequest[] = [];
    const pending = this.db.prepare("SELECT id, from_id, to_id, created_at FROM friend_requests WHERE from_id = ? OR to_id = ? ORDER BY created_at DESC")
      .all(user.id, user.id);
    for (const request of pending) {
      const incoming = request.to_id === user.id;
      const other = this.byId(String(incoming ? request.from_id : request.to_id));
      if (!other) continue;
      const item: FriendRequest = { id: String(request.id), fromId: String(request.from_id), toId: String(request.to_id),
        name: other.name, username: other.username, createdAt: String(request.created_at) };
      (incoming ? requests : sentRequests).push(item);
    }
    return { revision: this.revisionForUser(user, now), user, events: this.eventRows(user.id), friends, requests, sentRequests };
  }

  async mutate(input: Input, token?: string): Promise<MutationResult> {
    const action = text(input.action, "Action", 1, 30);
    if (action === "register" || action === "login") {
      this.limit("authentication:global", 100, 60_000);
      const handle = username(input.username);
      this.limit(`authentication:${handle}`, 12, 15 * 60_000);
      const secret = password(input.password);
      if (action === "register") {
        this.limit("registration:global", 30, 60 * 60_000);
        const name = text(input.name, "Name", 1, 60);
        const salt = randomBytes(16).toString("hex");
        const hash = (await deriveKey(secret, salt, 64)) as Buffer;
        const user: User = {
          id: randomUUID(), name, username: handle,
          inviteCode: `ASH-${randomBytes(6).toString("hex").toUpperCase()}`,
          timezone: "Asia/Kolkata", city: "", cigBaseline: 8, drinkBaseline: 2,
          dailyLimit: 8, defaultPrice: 25, sharing: "summary", priceOverrides: {},
          favoriteIds: [...DEFAULT_FAVORITES], createdAt: new Date().toISOString(),
        };
        let sessionToken: string;
        try {
          sessionToken = this.transaction(() => {
            this.db.prepare("INSERT INTO users(id, username, invite_code, password_hash, password_salt, profile_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
              .run(user.id, handle, user.inviteCode, hash.toString("hex"), salt, JSON.stringify(user), user.createdAt);
            if (token) this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
            return this.createSession(user.id);
          });
        } catch (error) {
          if (this.db.prepare("SELECT id FROM users WHERE username = ?").get(handle)) throw new StoreError("That username is already taken. Try another one.", 409);
          throw error;
        }
        return { state: this.state(sessionToken), sessionToken };
      }

      const row = this.db.prepare("SELECT id, password_hash, password_salt FROM users WHERE username = ?").get(handle);
      // Spend the same work for unknown usernames to avoid an account lookup shortcut.
      const salt = row ? String(row.password_salt) : "d941ba520e6f6fbce0cd6e0f0fdf48c8";
      const expected = row ? Buffer.from(String(row.password_hash), "hex") : Buffer.alloc(64);
      const derived = (await deriveKey(secret, salt, 64)) as Buffer;
      if (!row || !timingSafeEqual(expected, derived)) throw new StoreError("Username or password is incorrect.", 401);
      const sessionToken = this.transaction(() => {
        if (token) this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
        return this.createSession(String(row.id));
      });
      return { state: this.state(sessionToken), sessionToken };
    }

    if (action === "logout") {
      if (token) this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
      return { state: { ...EMPTY_STATE }, clearSession: true };
    }

    const user = this.sessionUser(token);
    if (!user) throw new StoreError("Sign in to continue.", 401);
    this.limit(`mutation:${user.id}`, 120, 60_000);

    switch (action) {
      case "log": this.log(user, input); break;
      case "delete": {
        const id = text(input.id, "Entry ID", 1, 80);
        const result = this.db.prepare("DELETE FROM tracker_events WHERE id = ? AND user_id = ?").run(id, user.id);
        if (!Number(result.changes)) throw new StoreError("That entry was not found.", 404);
        break;
      }
      case "settings": this.settings(user, input); break;
      case "request": this.request(user, input); break;
      case "respond": this.respond(user, input); break;
      case "remove": {
        const friendId = text(input.id, "Friend ID", 1, 80);
        const [low, high] = [user.id, friendId].sort();
        const result = this.db.prepare("DELETE FROM friendships WHERE low_id = ? AND high_id = ?").run(low, high);
        if (!Number(result.changes)) throw new StoreError("That connection was not found.", 404);
        break;
      }
      default: throw new StoreError("Unknown action.");
    }
    return { state: this.state(token) };
  }

  private log(user: User, input: Input): void {
    const id = text(input.productId, "Product", 1, 80);
    const product = CATALOG.find((item) => item.id === id);
    if (!product) throw new StoreError("Choose a product from the catalog.");
    const quantity = input.quantity === undefined ? 1 : number(input.quantity, "Quantity", 0.25, 100, product.kind === "cig");
    if (product.kind === "drink" && !Number.isInteger(quantity * 4)) throw new StoreError("Drink quantities use quarter-serving steps.");
    const source = input.source === undefined ? "manual" : text(input.source, "Source", 1, 20);
    if (!["manual", "shelf", "picker", "bottle"].includes(source)) throw new StoreError("Choose a valid entry source.");
    if (source === "bottle" && product.kind !== "drink") throw new StoreError("Bottle purchases are only available for drinks.");
    const unitCostInr = input.unitCostInr === undefined
      ? source === "bottle" ? product.packPrice : user.priceOverrides[id] ?? (product.kind === "cig" ? suggestedLoosePrice(id, user.defaultPrice) : displayCost(product))
      : price(input.unitCostInr);
    const note = input.note === undefined ? "" : text(input.note, "Note", 0, 280);
    let loggedAt = new Date();
    if (input.loggedAt !== undefined) {
      const value = text(input.loggedAt, "Date", 1, 50);
      const match = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
      if (!match) throw new StoreError("Choose a valid date and time with a timezone.");
      const calendarDate = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
      if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== value.slice(0, 10)) {
        throw new StoreError("Choose a valid calendar date.");
      }
      loggedAt = new Date(value);
      if (!Number.isFinite(loggedAt.getTime()) || loggedAt.getTime() < Date.UTC(2000, 0, 1) || loggedAt.getTime() > Date.now() + 60_000) {
        throw new StoreError("Entry dates must be between 2000 and now.");
      }
    }
    const zoned = getZonedParts(loggedAt, user.timezone);
    const bottle = source === "bottle";
    const volume = bottle && isSpiritPeg(product) ? 750 : product.volumeMl;
    const event: SocialEvent = {
      id: randomUUID(), kind: product.kind, productId: product.id,
      productName: bottle ? `${product.name} bottle` : product.name,
      brand: product.brand, variant: product.variant, manufacturer: product.manufacturer,
      loggedAt: loggedAt.toISOString(), createdAt: new Date().toISOString(), timezone: user.timezone,
      localDate: zoned.localDate, localTime: zoned.localTime, weekday: zoned.weekday, hour: zoned.hour,
      minute: zoned.minute, isoWeek: zoned.isoWeek, month: zoned.month, year: zoned.year,
      quantity, unitCostInr, nicotineMg: product.nicotineMg, tarMg: product.tarMg, coMg: product.coMg,
      lifeMinutes: null, abv: product.abv, volumeMl: volume,
      standardDrinks: bottle && product.abv && volume ? stdDrinks(volume, product.abv) : product.standardDrinks,
      calories: bottle && product.abv && volume ? spiritKcal(volume, product.abv) : product.calories,
      source, packPriceInr: product.packPrice, unitsPerPack: product.unitsPerPack, lengthMm: product.lengthMm,
      strength: product.strength, flavor: product.flavor, dayPart: dayPart(zoned.hour),
      city: user.city || cityFromTimezone(user.timezone), ...(note ? { note } : {}),
    };
    const requestId = input.requestId === undefined ? null : text(input.requestId, "Request ID", 36, 36).toLowerCase();
    if (requestId && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId)) {
      throw new StoreError("Use a valid request ID.");
    }
    if (requestId) event.requestId = requestId;
    const payloadHash = hashToken(JSON.stringify([id, quantity, input.unitCostInr === undefined ? null : unitCostInr,
      input.loggedAt === undefined ? null : loggedAt.toISOString(), note, source]));
    this.transaction(() => {
      if (requestId) {
        const prior = this.db.prepare("SELECT payload_hash FROM log_requests WHERE user_id = ? AND request_id = ?").get(user.id, requestId);
        if (prior) {
          if (prior.payload_hash !== payloadHash) throw new StoreError("That request ID was already used for a different check-in.", 409);
          // A network retry cannot double-charge or resurrect a deleted entry.
          return;
        }
      }
      this.db.prepare("INSERT INTO tracker_events(id, user_id, logged_at, event_json) VALUES (?, ?, ?, ?)")
        .run(event.id, user.id, event.loggedAt, JSON.stringify(event));
      if (requestId) this.db.prepare("INSERT INTO log_requests(user_id, request_id, payload_hash, event_id, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(user.id, requestId, payloadHash, event.id, event.createdAt);
    });
  }

  private settings(user: User, input: Input): void {
    this.transaction(() => {
      const current = this.byId(user.id);
      if (!current) throw new StoreError("Sign in to continue.", 401);
      const next = { ...current };
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
          if (!CATALOG.some((product) => product.id === id)) throw new StoreError("Unknown product in price overrides.");
          next.priceOverrides[id] = price(amount);
        }
      }
      if (input.favoriteIds !== undefined) {
        if (!Array.isArray(input.favoriteIds) || input.favoriteIds.length > 12 || input.favoriteIds.some((id) => typeof id !== "string" || !CATALOG.some((product) => product.id === id))) {
          throw new StoreError("Choose up to 12 products from the catalog.");
        }
        next.favoriteIds = [...new Set(input.favoriteIds as string[])];
      }
      this.db.prepare("UPDATE users SET profile_json = ? WHERE id = ?").run(JSON.stringify(next), user.id);
    });
  }

  private request(user: User, input: Input): void {
    this.limit(`invites:${user.id}`, 20, 60 * 60_000);
    this.transaction(() => {
      const code = text(input.code, "Invite code", 1, 64).toUpperCase().replace(/\s/g, "");
      const row = this.db.prepare("SELECT id FROM users WHERE invite_code = ?").get(code);
      if (!row) throw new StoreError("No account matches that invite code.", 404);
      const toId = String(row.id);
      if (toId === user.id) throw new StoreError("That is your own invite code.");
      const [low, high] = [user.id, toId].sort();
      if (this.db.prepare("SELECT low_id FROM friendships WHERE low_id = ? AND high_id = ?").get(low, high)) throw new StoreError("You are already connected.", 409);
      const existing = this.db.prepare("SELECT from_id FROM friend_requests WHERE low_id = ? AND high_id = ?").get(low, high);
      if (existing) throw new StoreError(existing.from_id === user.id ? "Your request is already pending." : "This person has already requested you. Accept their request to connect.", 409);
      this.db.prepare("INSERT INTO friend_requests(id, from_id, to_id, low_id, high_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(randomUUID(), user.id, toId, low, high, new Date().toISOString());
    });
  }

  private respond(user: User, input: Input): void {
    const id = text(input.id, "Request ID", 1, 80);
    if (typeof input.accept !== "boolean") throw new StoreError("Choose accept or decline.");
    this.transaction(() => {
      const pending = this.db.prepare("SELECT from_id, to_id, low_id, high_id FROM friend_requests WHERE id = ? AND to_id = ?").get(id, user.id);
      if (!pending) throw new StoreError("That request was not found.", 404);
      if (input.accept) this.db.prepare("INSERT OR IGNORE INTO friendships(low_id, high_id, connected_at) VALUES (?, ?, ?)")
        .run(String(pending.low_id), String(pending.high_id), new Date().toISOString());
      this.db.prepare("DELETE FROM friend_requests WHERE id = ? AND to_id = ?").run(id, user.id);
    });
  }
}

const singleton = globalThis as typeof globalThis & { __ashtrayLocalStore?: LocalStore };
export function getLocalStore(): LocalStore {
  return singleton.__ashtrayLocalStore ??= new LocalStore();
}
