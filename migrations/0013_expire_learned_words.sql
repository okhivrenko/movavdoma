-- Learned words are temporary: retain them for 30 days after the user marks
-- them learned, while active vocabulary remains unlimited and untouched.
ALTER TABLE words ADD COLUMN learned_at TEXT;

-- Existing learned words have no historical archive time. Start their 30-day
-- retention period at the moment this migration is applied.
UPDATE words
SET learned_at = CURRENT_TIMESTAMP
WHERE is_active = 0 AND learned_at IS NULL;

CREATE INDEX idx_words_learned_expiry
  ON words(is_active, learned_at);
