CREATE TABLE IF NOT EXISTS daily_word_prefetch_jobs (
  user_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing')),
  attempts INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(telegram_user_id)
);
