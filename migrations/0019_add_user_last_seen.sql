ALTER TABLE users
  ADD COLUMN last_seen_at TEXT;

CREATE INDEX IF NOT EXISTS idx_users_last_seen_at
  ON users(last_seen_at DESC);
