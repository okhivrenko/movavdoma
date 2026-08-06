-- Keep a compact per-user memory of vocabulary that has already been shown.
-- Unlike temporary learned-word records, this survives catalog cleanup so a
-- daily card cannot silently become a duplicate after the retention window.
CREATE TABLE IF NOT EXISTS user_seen_words (
  user_id INTEGER NOT NULL,
  normalized_word TEXT NOT NULL,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, normalized_word),
  FOREIGN KEY (user_id) REFERENCES users(telegram_user_id)
);

-- Preserve all vocabulary and daily cards that exist at rollout time.
INSERT OR IGNORE INTO user_seen_words (user_id, normalized_word, first_seen_at, last_seen_at)
SELECT user_id, lower(trim(source_text)), created_at, created_at
FROM words
WHERE trim(source_text) <> '';

INSERT OR IGNORE INTO user_seen_words (user_id, normalized_word, first_seen_at, last_seen_at)
SELECT user_id, lower(trim(source_text)), created_at, created_at
FROM daily_word_cards
WHERE trim(source_text) <> '';
