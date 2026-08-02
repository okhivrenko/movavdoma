-- Donation levels are temporary. Keep them separate from permanent manual and
-- legacy levels so an expiring bonus can safely fall back to the base level.
CREATE TABLE IF NOT EXISTS user_temporary_access_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  access_level INTEGER NOT NULL CHECK (access_level BETWEEN 1 AND 3),
  donation_request_id INTEGER NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(telegram_user_id),
  FOREIGN KEY (donation_request_id) REFERENCES donation_requests(id)
);

CREATE INDEX IF NOT EXISTS idx_temporary_access_grants_active
  ON user_temporary_access_grants(user_id, expires_at);
