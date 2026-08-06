CREATE TABLE IF NOT EXISTS daily_word_prefetches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  source_text TEXT NOT NULL,
  translation_uk TEXT NOT NULL,
  context_note TEXT NOT NULL,
  examples_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(telegram_user_id),
  UNIQUE (user_id, source_text)
);

CREATE INDEX IF NOT EXISTS idx_daily_word_prefetches_user_id
  ON daily_word_prefetches (user_id, id);
