CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  couple_id TEXT NOT NULL REFERENCES couples(id),
  author_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
  day TEXT NOT NULL,
  note TEXT NOT NULL CHECK(length(note) <= 2000),
  photo BLOB CHECK(photo IS NULL OR length(photo) <= 200000),
  photo_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(couple_id,author_id) REFERENCES couple_members(couple_id,user_id)
);
CREATE INDEX memories_by_couple ON memories(couple_id,day DESC,id DESC);
CREATE TABLE love_letters (
  id TEXT PRIMARY KEY,
  couple_id TEXT NOT NULL REFERENCES couples(id),
  author_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 5000),
  open_on TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(couple_id,author_id) REFERENCES couple_members(couple_id,user_id)
);
CREATE INDEX letters_by_couple ON love_letters(couple_id,created_at DESC,id DESC);
CREATE TABLE daily_moods (
  couple_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  mood TEXT NOT NULL CHECK(mood IN ('สดใส','อบอุ่น','เหนื่อยนิดหน่อย','อยากได้กอด','ตื่นเต้น')),
  note TEXT NOT NULL CHECK(length(note) <= 300),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  PRIMARY KEY(couple_id,user_id,day),
  FOREIGN KEY(couple_id,user_id) REFERENCES couple_members(couple_id,user_id)
);
CREATE INDEX moods_by_couple_day ON daily_moods(couple_id,day DESC,user_id);
