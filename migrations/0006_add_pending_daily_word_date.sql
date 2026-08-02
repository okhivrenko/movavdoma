ALTER TABLE pending_daily_words
  ADD COLUMN local_date TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_pending_daily_words_user_date
  ON pending_daily_words(user_id, local_date, id);
