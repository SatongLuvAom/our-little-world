CREATE TABLE quests (
  id TEXT PRIMARY KEY,
  couple_id TEXT NOT NULL REFERENCES couples(id),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),
  assignee_id TEXT,
  due TEXT NOT NULL CHECK(length(due) = 10),
  repeat TEXT NOT NULL CHECK(repeat IN ('ครั้งเดียว','รายวัน','รายสัปดาห์')),
  hearts INTEGER NOT NULL CHECK(typeof(hearts) = 'integer' AND hearts BETWEEN 1 AND 500),
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(couple_id,id),
  FOREIGN KEY(couple_id,assignee_id) REFERENCES couple_members(couple_id,user_id)
);
CREATE INDEX quests_by_couple ON quests(couple_id,deleted_at,created_at DESC,id DESC);

CREATE TABLE reward_catalog (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT NOT NULL, icon TEXT NOT NULL,
  cost INTEGER NOT NULL CHECK(typeof(cost) = 'integer' AND cost BETWEEN 1 AND 500),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
INSERT INTO reward_catalog(id,title,detail,icon,cost) VALUES
  ('dinner','มื้อโปรดของเธอ','วันนี้เราเป็นเจ้ามือเอง','dinner',80),
  ('massage','คูปองนวดไหล่','พักเหนื่อยด้วยกัน 15 นาที','massage',40),
  ('movie','คืนดูหนังของเรา','เธอเลือกหนัง เราเตรียมขนม','movie',60);

-- One row is both the business event and its wallet entry: they cannot partially commit.
CREATE TABLE heart_entries (
  couple_id TEXT NOT NULL REFERENCES couples(id),
  id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('completion','redemption')),
  actor_id TEXT NOT NULL,
  quest_id TEXT,
  period TEXT,
  reward_id TEXT REFERENCES reward_catalog(id),
  title TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(typeof(amount) = 'integer' AND amount <> 0 AND abs(amount) <= 500),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(couple_id,id),
  FOREIGN KEY(couple_id,actor_id) REFERENCES couple_members(couple_id,user_id),
  FOREIGN KEY(couple_id,quest_id) REFERENCES quests(couple_id,id),
  CHECK((kind = 'completion' AND quest_id IS NOT NULL AND period IS NOT NULL AND reward_id IS NULL AND amount > 0)
    OR (kind = 'redemption' AND quest_id IS NULL AND period IS NULL AND reward_id IS NOT NULL AND amount < 0))
);
CREATE UNIQUE INDEX one_quest_award_per_period ON heart_entries(couple_id,quest_id,period) WHERE kind = 'completion';
CREATE INDEX heart_history ON heart_entries(couple_id,created_at DESC,id DESC);
-- Keep the poll/spend path bounded instead of re-summing the entire lifetime ledger.
CREATE TABLE heart_wallets (
  couple_id TEXT PRIMARY KEY REFERENCES couples(id),
  balance INTEGER NOT NULL CHECK(balance >= 0),
  completion_count INTEGER NOT NULL CHECK(completion_count >= 0)
);
CREATE TRIGGER heart_entry_immutable BEFORE UPDATE ON heart_entries
BEGIN SELECT RAISE(ABORT,'heart_entry_immutable'); END;
CREATE TRIGGER heart_balance_nonnegative BEFORE INSERT ON heart_entries
WHEN NEW.amount < 0 AND coalesce((SELECT balance FROM heart_wallets WHERE couple_id = NEW.couple_id),0) + NEW.amount < 0
BEGIN SELECT RAISE(ABORT,'insufficient_hearts'); END;
CREATE TRIGGER heart_wallet_apply AFTER INSERT ON heart_entries
BEGIN
  INSERT INTO heart_wallets(couple_id,balance,completion_count)
  VALUES(NEW.couple_id,0,0) ON CONFLICT(couple_id) DO NOTHING;
  UPDATE heart_wallets SET balance = balance + NEW.amount,
    completion_count = completion_count + (NEW.kind = 'completion') WHERE couple_id = NEW.couple_id;
END;
CREATE TRIGGER quest_repeat_locked BEFORE UPDATE OF repeat ON quests
WHEN NEW.repeat <> OLD.repeat AND EXISTS(SELECT 1 FROM heart_entries WHERE couple_id = OLD.couple_id AND quest_id = OLD.id)
BEGIN SELECT RAISE(ABORT,'quest_repeat_locked'); END;
