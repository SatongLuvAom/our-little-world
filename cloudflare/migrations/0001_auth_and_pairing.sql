-- Better Auth 1.7 native D1 schema. D1 has no public browser data endpoint.
PRAGMA foreign_keys = ON;
CREATE TABLE auth_users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
  email TEXT NOT NULL UNIQUE, emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
  username TEXT UNIQUE COLLATE NOCASE
);
CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY, expiresAt INTEGER NOT NULL, token TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, ipAddress TEXT, userAgent TEXT,
  userId TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE
);
CREATE INDEX sessions_by_user ON auth_sessions(userId);
CREATE INDEX session_expiry ON auth_sessions(expiresAt);
CREATE TABLE auth_accounts (
  id TEXT PRIMARY KEY, accountId TEXT NOT NULL, providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  accessToken TEXT, refreshToken TEXT, idToken TEXT, accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER, scope TEXT, password TEXT,
  createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
  UNIQUE(providerId,accountId)
);
CREATE INDEX accounts_by_user ON auth_accounts(userId);
CREATE TABLE auth_verifications (
  id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
);
CREATE INDEX verification_identifier ON auth_verifications(identifier);
CREATE TABLE auth_rate_limit (id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, count INTEGER NOT NULL, lastRequest INTEGER NOT NULL);
CREATE TABLE couples (
  id TEXT PRIMARY KEY, anniversary TEXT NOT NULL CHECK(length(anniversary) = 10 AND anniversary >= '1900-01-01'),
  timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok' CHECK(timezone = 'Asia/Bangkok'),
  created_by TEXT NOT NULL UNIQUE REFERENCES auth_users(id), created_at INTEGER NOT NULL
);
CREATE TABLE couple_members (
  couple_id TEXT NOT NULL REFERENCES couples(id), user_id TEXT NOT NULL UNIQUE REFERENCES auth_users(id),
  joined_at INTEGER NOT NULL, PRIMARY KEY(couple_id,user_id)
);
CREATE TRIGGER couple_max_two BEFORE INSERT ON couple_members
WHEN (SELECT count(*) FROM couple_members WHERE couple_id = NEW.couple_id) >= 2
BEGIN SELECT RAISE(ABORT,'couple_full'); END;
CREATE TRIGGER membership_immutable BEFORE UPDATE ON couple_members
WHEN NEW.couple_id <> OLD.couple_id OR NEW.user_id <> OLD.user_id
BEGIN SELECT RAISE(ABORT,'membership_immutable'); END;
CREATE TABLE invitations (
  id TEXT PRIMARY KEY, couple_id TEXT NOT NULL REFERENCES couples(id),
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash) = 64),
  created_by TEXT NOT NULL REFERENCES auth_users(id), expires_at INTEGER NOT NULL,
  accepted_by TEXT REFERENCES auth_users(id), accepted_at INTEGER,
  revoked_at INTEGER, created_at INTEGER NOT NULL, CHECK((accepted_by IS NULL) = (accepted_at IS NULL))
);
CREATE UNIQUE INDEX one_pending_invitation ON invitations(couple_id) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX invitations_by_couple ON invitations(couple_id,created_at DESC);
