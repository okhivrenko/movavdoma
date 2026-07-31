ALTER TABLE user_daily_limits
  ADD COLUMN expires_at TEXT NOT NULL DEFAULT '9999-12-31 23:59:59';

CREATE INDEX IF NOT EXISTS idx_user_daily_limits_expiration
  ON user_daily_limits(user_id, expires_at);
