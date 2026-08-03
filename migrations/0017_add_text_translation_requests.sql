CREATE TABLE IF NOT EXISTS pending_text_translations (
  user_id INTEGER PRIMARY KEY,
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(telegram_user_id)
);

CREATE TABLE IF NOT EXISTS daily_text_translation_requests (
  user_id INTEGER NOT NULL,
  local_date TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, local_date),
  FOREIGN KEY (user_id) REFERENCES users(telegram_user_id)
);
