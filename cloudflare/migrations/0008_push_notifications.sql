CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  couple_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
  endpoint_hash TEXT NOT NULL UNIQUE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  device TEXT NOT NULL CHECK(length(device) BETWEEN 1 AND 40),
  quests INTEGER NOT NULL CHECK(quests IN (0,1)),
  dates INTEGER NOT NULL CHECK(dates IN (0,1)),
  letters INTEGER NOT NULL CHECK(letters IN (0,1)),
  created_at INTEGER NOT NULL,
  checked_at INTEGER NOT NULL DEFAULT 0,
  last_test_at INTEGER NOT NULL DEFAULT 0,
  last_sent_at INTEGER,
  last_status INTEGER,
  FOREIGN KEY(couple_id,user_id) REFERENCES couple_members(couple_id,user_id) ON DELETE CASCADE
);
CREATE INDEX push_due_devices ON push_subscriptions(checked_at,id);
CREATE INDEX push_by_user ON push_subscriptions(user_id,couple_id);
CREATE TRIGGER push_session_insert BEFORE INSERT ON push_subscriptions
WHEN NOT EXISTS(SELECT 1 FROM auth_sessions WHERE id=NEW.session_id AND userId=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'push_session_owner'); END;
CREATE TRIGGER push_session_update BEFORE UPDATE ON push_subscriptions
WHEN NEW.user_id<>OLD.user_id OR NEW.couple_id<>OLD.couple_id OR NEW.endpoint_hash<>OLD.endpoint_hash
  OR NOT EXISTS(SELECT 1 FROM auth_sessions WHERE id=NEW.session_id AND userId=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'push_session_owner'); END;
CREATE TRIGGER push_device_limit BEFORE INSERT ON push_subscriptions
WHEN NOT EXISTS(SELECT 1 FROM push_subscriptions WHERE endpoint_hash=NEW.endpoint_hash)
  AND ((SELECT count(*) FROM push_subscriptions WHERE user_id=NEW.user_id)>=3
    OR (SELECT count(*) FROM push_subscriptions)>=20)
BEGIN SELECT RAISE(ABORT,'push_device_limit'); END;

-- Keep receipts after unsubscribe/logout, so re-enabling the same endpoint cannot replay a reminder.
CREATE TABLE push_deliveries (
  id TEXT PRIMARY KEY,
  couple_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  endpoint_hash TEXT NOT NULL,
  event_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('sending','sent','failed','uncertain','retry')),
  attempts INTEGER NOT NULL DEFAULT 1 CHECK(attempts BETWEEN 1 AND 3),
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  status INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id,endpoint_hash,event_key),
  FOREIGN KEY(couple_id,user_id) REFERENCES couple_members(couple_id,user_id) ON DELETE CASCADE
);
CREATE INDEX push_delivery_expiry ON push_deliveries(created_at);
