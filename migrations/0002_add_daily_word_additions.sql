CREATE TABLE IF NOT EXISTS daily_word_additions (
  user_id INTEGER NOT NULL,
  local_date TEXT NOT NULL,
  additions INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, local_date),
  FOREIGN KEY (user_id) REFERENCES users(telegram_user_id)
);
