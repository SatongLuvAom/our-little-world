ALTER TABLE reward_catalog ADD COLUMN category TEXT NOT NULL DEFAULT 'reward' CHECK(category IN ('reward','pet'));
INSERT INTO reward_catalog(id,title,detail,icon,cost,category) VALUES
 ('mint-hat','หมวกใบโปรด','หมวกสีมินต์ของเจ้าตัวเล็ก','hat',50,'pet'),
 ('rose-rug','พรมสีชมพู','พรมอุ่น ๆ ของเราสองคน','rug',70,'pet');

CREATE TABLE achievement_catalog (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT NOT NULL,
 metric TEXT NOT NULL CHECK(metric IN ('completion','feeds')),
 target INTEGER NOT NULL CHECK(target > 0)
);
INSERT INTO achievement_catalog VALUES
 ('first-quest','ก้าวแรกของเรา','ทำภารกิจแรกสำเร็จ','completion',1),
 ('team-ten','ทีมเดียวกันเสมอ','ทำภารกิจสำเร็จ 10 ครั้ง','completion',10),
 ('pet-favorite','คนโปรดของโมจิ','ให้อาหารแมว 3 ครั้ง','feeds',3);
CREATE TABLE couple_achievements (
 couple_id TEXT NOT NULL REFERENCES couples(id),
 achievement_id TEXT NOT NULL REFERENCES achievement_catalog(id),
 unlocked_at INTEGER NOT NULL,
 PRIMARY KEY(couple_id,achievement_id)
);
CREATE TABLE pet_inventory (
 couple_id TEXT NOT NULL REFERENCES couples(id),
 item_id TEXT NOT NULL REFERENCES reward_catalog(id),
 purchase_id TEXT NOT NULL,
 acquired_at INTEGER NOT NULL,
 PRIMARY KEY(couple_id,item_id),
 UNIQUE(couple_id,purchase_id),
 FOREIGN KEY(couple_id,purchase_id) REFERENCES heart_entries(couple_id,id)
);
CREATE TABLE couple_pets (
 couple_id TEXT PRIMARY KEY REFERENCES couples(id),
 name TEXT NOT NULL DEFAULT 'โมจิ' CHECK(length(trim(name)) BETWEEN 1 AND 120),
 feeds INTEGER NOT NULL DEFAULT 0 CHECK(typeof(feeds)='integer' AND feeds >= 0),
 last_fed INTEGER,
 wearing TEXT,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
 FOREIGN KEY(couple_id,wearing) REFERENCES pet_inventory(couple_id,item_id)
);
CREATE TABLE pet_feeds (
 couple_id TEXT NOT NULL REFERENCES couples(id),
 id TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 fed_at INTEGER NOT NULL,
 PRIMARY KEY(couple_id,id),
 FOREIGN KEY(couple_id,actor_id) REFERENCES couple_members(couple_id,user_id)
);
CREATE TRIGGER pet_feed_immutable BEFORE UPDATE ON pet_feeds
BEGIN SELECT RAISE(ABORT,'pet_feed_immutable'); END;
CREATE TRIGGER pet_feed_cooldown BEFORE INSERT ON pet_feeds
WHEN NEW.fed_at < coalesce((SELECT last_fed + 14400000 FROM couple_pets WHERE couple_id=NEW.couple_id),NEW.fed_at)
BEGIN SELECT RAISE(ABORT,'pet_cooldown'); END;
CREATE TRIGGER pet_feed_apply AFTER INSERT ON pet_feeds
BEGIN
 INSERT INTO couple_pets(couple_id) VALUES(NEW.couple_id) ON CONFLICT DO NOTHING;
 UPDATE couple_pets SET feeds=feeds+1,last_fed=NEW.fed_at,version=version+1 WHERE couple_id=NEW.couple_id;
 INSERT INTO couple_achievements(couple_id,achievement_id,unlocked_at)
 SELECT NEW.couple_id,a.id,NEW.fed_at FROM achievement_catalog a
 WHERE a.metric='feeds' AND a.target <= (SELECT feeds FROM couple_pets WHERE couple_id=NEW.couple_id)
 ON CONFLICT DO NOTHING;
END;
CREATE TRIGGER pet_purchase_guard BEFORE INSERT ON heart_entries
WHEN NEW.kind='redemption' AND EXISTS(SELECT 1 FROM reward_catalog WHERE id=NEW.reward_id AND category='pet')
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM pet_inventory WHERE couple_id=NEW.couple_id AND item_id=NEW.reward_id)
   THEN RAISE(ABORT,'pet_item_owned') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM reward_catalog WHERE id=NEW.reward_id AND active=1 AND -cost=NEW.amount)
   THEN RAISE(ABORT,'pet_price_invalid') END;
END;
CREATE TRIGGER pet_purchase_apply AFTER INSERT ON heart_entries
WHEN NEW.kind='redemption' AND EXISTS(SELECT 1 FROM reward_catalog WHERE id=NEW.reward_id AND category='pet')
BEGIN
 INSERT INTO pet_inventory(couple_id,item_id,purchase_id,acquired_at) VALUES(NEW.couple_id,NEW.reward_id,NEW.id,NEW.created_at);
 INSERT INTO couple_pets(couple_id) VALUES(NEW.couple_id) ON CONFLICT DO NOTHING;
 UPDATE couple_pets SET wearing=NEW.reward_id,version=version+1 WHERE couple_id=NEW.couple_id;
END;

-- Award badges inside the existing wallet transaction, after the completion rollup is updated.
DROP TRIGGER heart_wallet_apply;
CREATE TRIGGER heart_wallet_apply AFTER INSERT ON heart_entries
BEGIN
 INSERT INTO heart_wallets(couple_id,balance,completion_count) VALUES(NEW.couple_id,0,0) ON CONFLICT(couple_id) DO NOTHING;
 UPDATE heart_wallets SET balance=balance+NEW.amount,completion_count=completion_count+(NEW.kind='completion') WHERE couple_id=NEW.couple_id;
 INSERT INTO couple_achievements(couple_id,achievement_id,unlocked_at)
 SELECT NEW.couple_id,a.id,NEW.created_at FROM achievement_catalog a
 WHERE NEW.kind='completion' AND a.metric='completion' AND a.target <= (SELECT completion_count FROM heart_wallets WHERE couple_id=NEW.couple_id)
 ON CONFLICT DO NOTHING;
END;
-- Existing completed quests also qualify when this feature is enabled; balances are untouched.
INSERT INTO couple_achievements(couple_id,achievement_id,unlocked_at)
SELECT w.couple_id,a.id,CAST(strftime('%s','now') AS INTEGER)*1000
FROM heart_wallets w JOIN achievement_catalog a ON a.metric='completion' AND a.target<=w.completion_count;
