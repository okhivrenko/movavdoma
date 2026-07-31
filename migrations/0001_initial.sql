CREATE TABLE IF NOT EXISTS users (
  telegram_user_id INTEGER PRIMARY KEY,
  chat_id INTEGER NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Warsaw',
  daily_time TEXT NOT NULL DEFAULT '09:00',
  is_active INTEGER NOT NULL DEFAULT 1,
  last_delivery_local_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  source_text TEXT NOT NULL,
  source_language TEXT NOT NULL DEFAULT 'en',
  translation_uk TEXT,
  context_note TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(telegram_user_id)
);

CREATE INDEX IF NOT EXISTS idx_words_user_created
    ON words(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS examples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER NOT NULL,
  sentence_source TEXT NOT NULL,
  sentence_uk TEXT NOT NULL,
  position INTEGER NOT NULL,
  FOREIGN KEY (word_id) REFERENCES words(id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  shown_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  answer TEXT,
  next_review_at TEXT,
  FOREIGN KEY (word_id) REFERENCES words(id),
  FOREIGN KEY (user_id) REFERENCES users(telegram_user_id)
);

CREATE TABLE IF NOT EXISTS processed_updates (
  update_id INTEGER PRIMARY KEY,
  processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pending_words (
  user_id INTEGER PRIMARY KEY,
  source_text TEXT NOT NULL,
  senses_json TEXT NOT NULL,
  chat_id INTEGER,
  message_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(telegram_user_id)
);
