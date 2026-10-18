-- Operational counters are separate from business data and encrypted backups.
CREATE TABLE diagnostic_events (
 day INTEGER NOT NULL,
 source TEXT NOT NULL CHECK(source IN ('browser','server')),
 bucket TEXT NOT NULL,
 couple_id TEXT REFERENCES couples(id) ON DELETE CASCADE,
 route TEXT NOT NULL CHECK(length(route)<=64),
 code TEXT NOT NULL CHECK(code IN ('runtime','promise','render','asset','unexpected','dispatch')),
 count INTEGER NOT NULL CHECK(count BETWEEN 1 AND 20),
 first_at INTEGER NOT NULL,
 last_at INTEGER NOT NULL,
 last_id TEXT NOT NULL,
 version TEXT NOT NULL CHECK(length(version)<=64),
 PRIMARY KEY(day,source,bucket,route,code),
 CHECK((couple_id IS NULL AND bucket='system') OR (couple_id IS NOT NULL AND bucket=couple_id))
);
CREATE INDEX diagnostics_by_couple ON diagnostic_events(couple_id,day DESC,last_at DESC);
