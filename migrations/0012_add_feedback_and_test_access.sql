ALTER TABLE users
  ADD COLUMN feedback_pending INTEGER NOT NULL DEFAULT 0;

-- Rebuild the temporary-grant table so a one-day admin test does not need a
-- donation request and expired donation grants can be notified exactly once.
ALTER TABLE user_temporary_access_grants RENAME TO user_temporary_access_grants_old;

CREATE TABLE user_temporary_access_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  access_level INTEGER NOT NULL CHECK (access_level BETWEEN 1 AND 3),
  donation_request_id INTEGER UNIQUE,
  source TEXT NOT NULL CHECK (source IN ('donation', 'admin_test')),
  expires_at TEXT NOT NULL,
  expired_notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(telegram_user_id),
  FOREIGN KEY (donation_request_id) REFERENCES donation_requests(id)
);

INSERT INTO user_temporary_access_grants (
  id, user_id, access_level, donation_request_id, source, expires_at, created_at
)
SELECT id, user_id, access_level, donation_request_id, 'donation', expires_at, created_at
FROM user_temporary_access_grants_old;

DROP TABLE user_temporary_access_grants_old;

CREATE INDEX idx_temporary_access_grants_active
  ON user_temporary_access_grants(user_id, expires_at);
