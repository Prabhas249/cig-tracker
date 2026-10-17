-- Explicit, idempotent deployment migration. Legacy public.* tables are untouched.
BEGIN;
CREATE SCHEMA IF NOT EXISTS ashtray;
CREATE TABLE IF NOT EXISTS ashtray.users (
  id text PRIMARY KEY,
  username text NOT NULL UNIQUE CHECK (username = lower(username)),
  invite_code text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  password_salt text NOT NULL,
  profile_json jsonb NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS ashtray.sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES ashtray.users(id) ON DELETE CASCADE,
  expires_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON ashtray.sessions(expires_at);
CREATE TABLE IF NOT EXISTS ashtray.tracker_events (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES ashtray.users(id) ON DELETE CASCADE,
  logged_at timestamptz NOT NULL,
  event_json jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS events_owner_date ON ashtray.tracker_events(user_id, logged_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS ashtray.friendships (
  low_id text NOT NULL REFERENCES ashtray.users(id) ON DELETE CASCADE,
  high_id text NOT NULL REFERENCES ashtray.users(id) ON DELETE CASCADE,
  connected_at timestamptz NOT NULL,
  PRIMARY KEY(low_id, high_id), CHECK(low_id < high_id)
);
CREATE TABLE IF NOT EXISTS ashtray.friend_requests (
  id text PRIMARY KEY,
  from_id text NOT NULL REFERENCES ashtray.users(id) ON DELETE CASCADE,
  to_id text NOT NULL REFERENCES ashtray.users(id) ON DELETE CASCADE,
  low_id text NOT NULL, high_id text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE(low_id, high_id), CHECK(from_id <> to_id), CHECK(low_id < high_id)
);
CREATE TABLE IF NOT EXISTS ashtray.log_requests (
  user_id text NOT NULL REFERENCES ashtray.users(id) ON DELETE CASCADE,
  request_id text NOT NULL, payload_hash text NOT NULL,
  event_id text NOT NULL, created_at timestamptz NOT NULL,
  PRIMARY KEY(user_id, request_id)
);
CREATE TABLE IF NOT EXISTS ashtray.rate_limits (
  key text PRIMARY KEY, count integer NOT NULL, reset_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS ashtray.sync_revisions (
  user_id text PRIMARY KEY REFERENCES ashtray.users(id) ON DELETE CASCADE,
  own_revision bigint NOT NULL DEFAULT 0, activity_revision bigint NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ashtray.legacy_imports (
  source_key text PRIMARY KEY,
  user_id text NOT NULL REFERENCES ashtray.users(id),
  imported_at timestamptz NOT NULL
);
INSERT INTO ashtray.sync_revisions(user_id) SELECT id FROM ashtray.users ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION ashtray.sync_user() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO ashtray.sync_revisions(user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  ELSIF OLD.profile_json IS DISTINCT FROM NEW.profile_json THEN
    UPDATE ashtray.sync_revisions SET own_revision = own_revision + 1 WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sync_user_insert ON ashtray.users;
CREATE TRIGGER sync_user_insert AFTER INSERT ON ashtray.users FOR EACH ROW EXECUTE FUNCTION ashtray.sync_user();
DROP TRIGGER IF EXISTS sync_user_profile ON ashtray.users;
CREATE TRIGGER sync_user_profile AFTER UPDATE OF profile_json ON ashtray.users FOR EACH ROW EXECUTE FUNCTION ashtray.sync_user();

CREATE OR REPLACE FUNCTION ashtray.sync_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE ashtray.sync_revisions SET own_revision = own_revision + 1,
      activity_revision = activity_revision + CASE WHEN NEW.event_json->>'kind' = 'cig' THEN 1 ELSE 0 END
      WHERE user_id = NEW.user_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE ashtray.sync_revisions SET own_revision = own_revision + 1,
      activity_revision = activity_revision + CASE WHEN OLD.event_json->>'kind' = 'cig' THEN 1 ELSE 0 END
      WHERE user_id = OLD.user_id;
    RETURN OLD;
  END IF;
  UPDATE ashtray.sync_revisions SET own_revision = own_revision + 1 WHERE user_id IN (OLD.user_id, NEW.user_id);
  -- Notes, source and other private-only edits do not reveal update timing.
  changed := ROW(OLD.id, OLD.user_id, OLD.logged_at, OLD.event_json->'kind', OLD.event_json->'productId', OLD.event_json->'productName', OLD.event_json->'quantity', OLD.event_json->'unitCostInr')
    IS DISTINCT FROM ROW(NEW.id, NEW.user_id, NEW.logged_at, NEW.event_json->'kind', NEW.event_json->'productId', NEW.event_json->'productName', NEW.event_json->'quantity', NEW.event_json->'unitCostInr');
  IF changed THEN
    UPDATE ashtray.sync_revisions SET activity_revision = activity_revision + 1
      WHERE (user_id = OLD.user_id AND OLD.event_json->>'kind' = 'cig')
         OR (user_id = NEW.user_id AND NEW.event_json->>'kind' = 'cig');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sync_event_change ON ashtray.tracker_events;
CREATE TRIGGER sync_event_change AFTER INSERT OR UPDATE OR DELETE ON ashtray.tracker_events FOR EACH ROW EXECUTE FUNCTION ashtray.sync_event();

CREATE OR REPLACE FUNCTION ashtray.sync_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE ashtray.sync_revisions SET own_revision = own_revision + 1 WHERE user_id IN (OLD.from_id, OLD.to_id);
    RETURN OLD;
  END IF;
  UPDATE ashtray.sync_revisions SET own_revision = own_revision + 1 WHERE user_id IN (NEW.from_id, NEW.to_id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sync_request_change ON ashtray.friend_requests;
CREATE TRIGGER sync_request_change AFTER INSERT OR DELETE ON ashtray.friend_requests FOR EACH ROW EXECUTE FUNCTION ashtray.sync_request();

CREATE OR REPLACE FUNCTION ashtray.sync_connection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE ashtray.sync_revisions SET own_revision = own_revision + 1 WHERE user_id IN (OLD.low_id, OLD.high_id);
    RETURN OLD;
  END IF;
  UPDATE ashtray.sync_revisions SET own_revision = own_revision + 1 WHERE user_id IN (NEW.low_id, NEW.high_id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sync_connection_change ON ashtray.friendships;
CREATE TRIGGER sync_connection_change AFTER INSERT OR DELETE ON ashtray.friendships FOR EACH ROW EXECUTE FUNCTION ashtray.sync_connection();
COMMIT;
