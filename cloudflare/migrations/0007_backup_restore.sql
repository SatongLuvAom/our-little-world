-- Revision checks make paged exports consistent and make restore reject concurrent edits.
CREATE TABLE couple_revisions (
 couple_id TEXT PRIMARY KEY REFERENCES couples(id),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0)
);
INSERT INTO couple_revisions(couple_id) SELECT id FROM couples;
CREATE TRIGGER backup_couple_created AFTER INSERT ON couples
BEGIN INSERT INTO couple_revisions(couple_id) VALUES(NEW.id); END;
CREATE TRIGGER backup_couple_updated AFTER UPDATE ON couples
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.id; END;

CREATE TABLE backup_jobs (
 id TEXT PRIMARY KEY, couple_id TEXT NOT NULL UNIQUE REFERENCES couples(id),
 manifest TEXT NOT NULL CHECK(json_valid(manifest)), expected_revision INTEGER NOT NULL,
 part_count INTEGER NOT NULL CHECK(part_count BETWEEN 0 AND 3000),
 state TEXT NOT NULL CHECK(state IN ('staging','applying','applied')), expires_at INTEGER NOT NULL
);
CREATE TABLE backup_parts (
 job_id TEXT NOT NULL REFERENCES backup_jobs(id) ON DELETE CASCADE,
 part_index INTEGER NOT NULL, bytes INTEGER NOT NULL CHECK(bytes>=0),
 PRIMARY KEY(job_id,part_index)
);
CREATE TABLE backup_rows (
 job_id TEXT NOT NULL, part_index INTEGER NOT NULL, row_index INTEGER NOT NULL,
 table_name TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), photo BLOB,
 PRIMARY KEY(job_id,part_index,row_index),
 FOREIGN KEY(job_id,part_index) REFERENCES backup_parts(job_id,part_index) ON DELETE CASCADE
);
CREATE INDEX backup_rows_table ON backup_rows(job_id,table_name,part_index,row_index);
CREATE TRIGGER backup_restore_guard BEFORE UPDATE OF state ON backup_jobs
WHEN NEW.state='applying'
BEGIN
 SELECT CASE WHEN NEW.expected_revision<>(SELECT revision FROM couple_revisions WHERE couple_id=NEW.couple_id)
   OR NEW.expires_at<CAST(strftime('%s','now') AS INTEGER)*1000
   THEN RAISE(ABORT,'backup_conflict') END;
 SELECT CASE WHEN NEW.part_count<>(SELECT count(*) FROM backup_parts WHERE job_id=NEW.id)
   OR (SELECT sum(value) FROM json_each(NEW.manifest,'$.counts'))<>(SELECT count(*) FROM backup_rows WHERE job_id=NEW.id)
   THEN RAISE(ABORT,'backup_incomplete') END;
END;
CREATE TRIGGER backup_revision_quests_insert AFTER INSERT ON quests
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_quests_update AFTER UPDATE ON quests
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_quests_delete AFTER DELETE ON quests
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=OLD.couple_id; END;
CREATE TRIGGER backup_revision_heart_entries_insert AFTER INSERT ON heart_entries
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_heart_entries_update AFTER UPDATE ON heart_entries
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_heart_entries_delete AFTER DELETE ON heart_entries
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=OLD.couple_id; END;
CREATE TRIGGER backup_revision_savings_goals_insert AFTER INSERT ON savings_goals
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_savings_goals_update AFTER UPDATE ON savings_goals
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_savings_goals_delete AFTER DELETE ON savings_goals
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=OLD.couple_id; END;
CREATE TRIGGER backup_revision_savings_entries_insert AFTER INSERT ON savings_entries
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_savings_entries_update AFTER UPDATE ON savings_entries
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_savings_entries_delete AFTER DELETE ON savings_entries
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=OLD.couple_id; END;
CREATE TRIGGER backup_revision_planned_dates_insert AFTER INSERT ON planned_dates
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_planned_dates_update AFTER UPDATE ON planned_dates
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_planned_dates_delete AFTER DELETE ON planned_dates
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=OLD.couple_id; END;
CREATE TRIGGER backup_revision_planned_wishes_insert AFTER INSERT ON planned_wishes
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_planned_wishes_update AFTER UPDATE ON planned_wishes
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_planned_wishes_delete AFTER DELETE ON planned_wishes
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=OLD.couple_id; END;
CREATE TRIGGER backup_revision_planned_events_insert AFTER INSERT ON planned_events
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_planned_events_update AFTER UPDATE ON planned_events
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_planned_events_delete AFTER DELETE ON planned_events
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=OLD.couple_id; END;
CREATE TRIGGER backup_revision_memories_insert AFTER INSERT ON memories
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_memories_update AFTER UPDATE ON memories
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_memories_delete AFTER DELETE ON memories
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=OLD.couple_id; END;
CREATE TRIGGER backup_revision_love_letters_insert AFTER INSERT ON love_letters
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_love_letters_update AFTER UPDATE ON love_letters
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_love_letters_delete AFTER DELETE ON love_letters
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=OLD.couple_id; END;
CREATE TRIGGER backup_revision_daily_moods_insert AFTER INSERT ON daily_moods
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_daily_moods_update AFTER UPDATE ON daily_moods
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_daily_moods_delete AFTER DELETE ON daily_moods
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=OLD.couple_id; END;
CREATE TRIGGER backup_revision_pet_feeds_insert AFTER INSERT ON pet_feeds
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_pet_feeds_update AFTER UPDATE ON pet_feeds
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_pet_feeds_delete AFTER DELETE ON pet_feeds
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=OLD.couple_id; END;
CREATE TRIGGER backup_revision_couple_pets_insert AFTER INSERT ON couple_pets
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_couple_pets_update AFTER UPDATE ON couple_pets
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_couple_pets_delete AFTER DELETE ON couple_pets
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=OLD.couple_id; END;
CREATE TRIGGER backup_revision_couple_achievements_insert AFTER INSERT ON couple_achievements
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_couple_achievements_update AFTER UPDATE ON couple_achievements
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_couple_achievements_delete AFTER DELETE ON couple_achievements
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=OLD.couple_id; END;
CREATE TRIGGER backup_revision_couple_members_insert AFTER INSERT ON couple_members
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_couple_members_update AFTER UPDATE ON couple_members
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=NEW.couple_id; END;
CREATE TRIGGER backup_revision_couple_members_delete AFTER DELETE ON couple_members
BEGIN UPDATE couple_revisions SET revision=revision+1 WHERE couple_id=OLD.couple_id; END;
