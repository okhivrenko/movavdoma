ALTER TABLE users
  ADD COLUMN daily_enabled INTEGER NOT NULL DEFAULT 1;

ALTER TABLE users
  ADD COLUMN daily_level TEXT NOT NULL DEFAULT 'B1';

CREATE TABLE IF NOT EXISTS pending_daily_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  source_text TEXT NOT NULL,
  translation_uk TEXT NOT NULL,
  context_note TEXT NOT NULL,
  examples_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(telegram_user_id)
);

CREATE INDEX IF NOT EXISTS idx_pending_daily_words_user
  ON pending_daily_words(user_id, id);
