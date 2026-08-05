CREATE TABLE IF NOT EXISTS daily_word_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  source_text TEXT NOT NULL,
  translation_uk TEXT NOT NULL,
  context_note TEXT NOT NULL,
  examples_json TEXT NOT NULL,
  local_date TEXT NOT NULL,
  learned_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(telegram_user_id)
);

-- Preserve currently displayed cards and their callback IDs during the move.
INSERT OR IGNORE INTO daily_word_cards (
  id, user_id, source_text, translation_uk, context_note, examples_json, local_date, created_at
)
SELECT id, user_id, source_text, translation_uk, context_note, examples_json, local_date, created_at
FROM pending_daily_words;

CREATE INDEX IF NOT EXISTS idx_daily_word_cards_user_date_id
  ON daily_word_cards(user_id, local_date, id);
