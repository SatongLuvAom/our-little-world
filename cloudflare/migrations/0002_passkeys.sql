CREATE TABLE auth_passkeys (
  id TEXT PRIMARY KEY,
  name TEXT,
  publicKey TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  credentialID TEXT NOT NULL UNIQUE,
  counter INTEGER NOT NULL CHECK(counter >= 0),
  deviceType TEXT NOT NULL,
  backedUp INTEGER NOT NULL CHECK(backedUp IN (0,1)),
  transports TEXT,
  createdAt INTEGER,
  aaguid TEXT
);
CREATE INDEX passkeys_by_user ON auth_passkeys(userId);
