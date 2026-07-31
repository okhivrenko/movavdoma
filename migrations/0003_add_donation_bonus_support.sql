CREATE TABLE IF NOT EXISTS donation_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  support_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'awaiting_payment',
  requested_at TEXT,
  matched_transaction_id TEXT,
  granted_daily_limit INTEGER,
  admin_notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  granted_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(telegram_user_id)
);

CREATE INDEX IF NOT EXISTS idx_donation_requests_status
  ON donation_requests(status, admin_notified_at);

CREATE TABLE IF NOT EXISTS bank_transactions (
  transaction_id TEXT PRIMARY KEY,
  amount_kopiykas INTEGER NOT NULL,
  transaction_time INTEGER NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  matched_request_id INTEGER,
  admin_notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (matched_request_id) REFERENCES donation_requests(id)
);

CREATE TABLE IF NOT EXISTS user_daily_limits (
  user_id INTEGER PRIMARY KEY,
  daily_limit INTEGER NOT NULL,
  donation_request_id INTEGER,
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(telegram_user_id),
  FOREIGN KEY (donation_request_id) REFERENCES donation_requests(id)
);

CREATE TABLE IF NOT EXISTS monobank_sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  jar_id TEXT,
  last_attempt_at INTEGER NOT NULL DEFAULT 0,
  last_successful_sync_at INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO monobank_sync_state (id) VALUES (1);
