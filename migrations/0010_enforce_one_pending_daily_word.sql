-- A user may have only one unanswered daily card for one local date. Keep the
-- newest card if an older Worker version created duplicates before this guard.
DELETE FROM pending_daily_words
WHERE id NOT IN (
  SELECT MAX(id)
  FROM pending_daily_words
  GROUP BY user_id, local_date
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_daily_words_one_per_day
  ON pending_daily_words(user_id, local_date);
