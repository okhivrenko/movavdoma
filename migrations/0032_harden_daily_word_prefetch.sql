ALTER TABLE daily_word_prefetches
  ADD COLUMN cefr_level TEXT NOT NULL DEFAULT 'B1';

UPDATE daily_word_prefetches
SET cefr_level = COALESCE((
  SELECT users.daily_level
  FROM users
  WHERE users.telegram_user_id = daily_word_prefetches.user_id
), 'B1');

-- The previous uniqueness rule allowed one active job per pending card. Keep
-- the newest job per user so tightening the invariant remains deploy-safe even
-- if the Worker was interrupted with multiple cards queued for that user.
UPDATE daily_word_generation_jobs AS older
SET status = 'failed',
    last_error = 'Superseded by migration 0032',
    updated_at = CURRENT_TIMESTAMP
WHERE status IN ('queued', 'processing')
  AND EXISTS (
    SELECT 1
    FROM daily_word_generation_jobs AS newer
    WHERE newer.user_id = older.user_id
      AND newer.status IN ('queued', 'processing')
      AND newer.id > older.id
  );

DROP INDEX IF EXISTS idx_daily_word_generation_jobs_active;

CREATE UNIQUE INDEX idx_daily_word_generation_jobs_active
  ON daily_word_generation_jobs (user_id)
  WHERE status IN ('queued', 'processing');

CREATE INDEX idx_daily_word_generation_jobs_recovery
  ON daily_word_generation_jobs (status, updated_at);

CREATE INDEX idx_daily_word_prefetches_level
  ON daily_word_prefetches (user_id, cefr_level, id);

CREATE INDEX idx_daily_word_prefetch_jobs_recovery
  ON daily_word_prefetch_jobs (status, updated_at);
