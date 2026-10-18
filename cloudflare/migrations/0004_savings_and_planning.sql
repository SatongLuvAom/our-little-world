CREATE TABLE savings_goals (
  id TEXT PRIMARY KEY, couple_id TEXT NOT NULL REFERENCES couples(id),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),
  target_cents INTEGER NOT NULL CHECK(typeof(target_cents) = 'integer' AND target_cents BETWEEN 1 AND 10000000000),
  due TEXT NOT NULL CHECK(length(due) = 10), version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL, UNIQUE(couple_id,id)
);
CREATE INDEX savings_goals_by_couple ON savings_goals(couple_id,created_at,id);
CREATE TABLE savings_entries (
  couple_id TEXT NOT NULL REFERENCES couples(id), id TEXT NOT NULL,
  goal_id TEXT NOT NULL, actor_id TEXT NOT NULL, contributor_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('deposit','reversal')),
  amount_cents INTEGER NOT NULL CHECK(typeof(amount_cents) = 'integer' AND abs(amount_cents) BETWEEN 1 AND 1000000000),
  reverses_id TEXT, note TEXT NOT NULL CHECK(length(note) <= 200), created_at INTEGER NOT NULL,
  PRIMARY KEY(couple_id,id),
  FOREIGN KEY(couple_id,goal_id) REFERENCES savings_goals(couple_id,id),
  FOREIGN KEY(couple_id,actor_id) REFERENCES couple_members(couple_id,user_id),
  FOREIGN KEY(couple_id,contributor_id) REFERENCES couple_members(couple_id,user_id),
  FOREIGN KEY(couple_id,reverses_id) REFERENCES savings_entries(couple_id,id),
  CHECK((kind = 'deposit' AND amount_cents > 0 AND reverses_id IS NULL)
    OR (kind = 'reversal' AND amount_cents < 0 AND reverses_id IS NOT NULL AND length(trim(note)) > 0))
);
CREATE UNIQUE INDEX one_savings_reversal ON savings_entries(couple_id,reverses_id) WHERE kind = 'reversal';
CREATE INDEX savings_history ON savings_entries(couple_id,created_at DESC,id DESC);
CREATE TABLE savings_balances (
  couple_id TEXT NOT NULL, goal_id TEXT NOT NULL, contributor_id TEXT NOT NULL,
  total_cents INTEGER NOT NULL CHECK(typeof(total_cents) = 'integer' AND total_cents BETWEEN 0 AND 10000000000),
  PRIMARY KEY(couple_id,goal_id,contributor_id),
  FOREIGN KEY(couple_id,goal_id) REFERENCES savings_goals(couple_id,id),
  FOREIGN KEY(couple_id,contributor_id) REFERENCES couple_members(couple_id,user_id)
);
CREATE TRIGGER savings_entry_immutable BEFORE UPDATE ON savings_entries
BEGIN SELECT RAISE(ABORT,'savings_entry_immutable'); END;
CREATE TRIGGER savings_reversal_valid BEFORE INSERT ON savings_entries
WHEN NEW.kind = 'reversal' AND NOT EXISTS(
  SELECT 1 FROM savings_entries e WHERE e.couple_id = NEW.couple_id AND e.id = NEW.reverses_id
    AND e.kind = 'deposit' AND e.goal_id = NEW.goal_id AND e.contributor_id = NEW.contributor_id AND e.amount_cents = -NEW.amount_cents)
BEGIN SELECT RAISE(ABORT,'savings_reversal_invalid'); END;
CREATE TRIGGER savings_balance_guard BEFORE INSERT ON savings_entries
WHEN coalesce((SELECT total_cents FROM savings_balances WHERE couple_id = NEW.couple_id AND goal_id = NEW.goal_id AND contributor_id = NEW.contributor_id),0) + NEW.amount_cents < 0
  OR coalesce((SELECT sum(total_cents) FROM savings_balances WHERE couple_id = NEW.couple_id AND goal_id = NEW.goal_id),0) + NEW.amount_cents > 10000000000
BEGIN SELECT RAISE(ABORT,'savings_balance_limit'); END;
CREATE TRIGGER savings_balance_apply AFTER INSERT ON savings_entries
BEGIN
  INSERT INTO savings_balances(couple_id,goal_id,contributor_id,total_cents)
  VALUES(NEW.couple_id,NEW.goal_id,NEW.contributor_id,0) ON CONFLICT DO NOTHING;
  UPDATE savings_balances SET total_cents = total_cents + NEW.amount_cents
  WHERE couple_id = NEW.couple_id AND goal_id = NEW.goal_id AND contributor_id = NEW.contributor_id;
END;
CREATE TABLE planned_dates (
  id TEXT PRIMARY KEY, couple_id TEXT NOT NULL REFERENCES couples(id),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120), place TEXT NOT NULL CHECK(length(trim(place)) BETWEEN 1 AND 120),
  day TEXT NOT NULL CHECK(length(day) = 10), time TEXT NOT NULL CHECK(length(time) = 5 AND time BETWEEN '00:00' AND '23:59'),
  budget_cents INTEGER NOT NULL CHECK(typeof(budget_cents) = 'integer' AND budget_cents BETWEEN 0 AND 1000000000),
  version INTEGER NOT NULL DEFAULT 1, deleted_at INTEGER, created_at INTEGER NOT NULL
);
CREATE INDEX planned_dates_by_couple ON planned_dates(couple_id,deleted_at,day,time,id);
CREATE TABLE planned_wishes (
  id TEXT PRIMARY KEY, couple_id TEXT NOT NULL REFERENCES couples(id),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),
  category TEXT NOT NULL CHECK(category IN ('สถานที่','ร้านอาหาร','สิ่งของ')),
  done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1, deleted_at INTEGER, created_at INTEGER NOT NULL
);
CREATE INDEX planned_wishes_by_couple ON planned_wishes(couple_id,deleted_at,created_at,id);
CREATE TABLE planned_events (
  id TEXT PRIMARY KEY, couple_id TEXT NOT NULL REFERENCES couples(id),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120), day TEXT NOT NULL CHECK(length(day) = 10),
  event_kind TEXT NOT NULL CHECK(event_kind IN ('กิจกรรม','วันสำคัญ','วันครบรอบ')),
  version INTEGER NOT NULL DEFAULT 1, deleted_at INTEGER, created_at INTEGER NOT NULL
);
CREATE INDEX planned_events_by_couple ON planned_events(couple_id,deleted_at,day,id);
