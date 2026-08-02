CREATE TABLE IF NOT EXISTS user_access_levels (
  user_id INTEGER PRIMARY KEY,
  access_level INTEGER NOT NULL DEFAULT 0 CHECK (access_level BETWEEN 0 AND 3),
  donation_request_id INTEGER,
  source TEXT NOT NULL DEFAULT 'manual',
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(telegram_user_id),
  FOREIGN KEY (donation_request_id) REFERENCES donation_requests(id)
);

-- Preserve access earned through already approved donation bonuses. Manual
-- temporary word-addition bonuses intentionally do not create access levels.
INSERT INTO user_access_levels (user_id, access_level, donation_request_id, source)
SELECT
  user_id,
  CASE
    WHEN daily_limit >= 40 THEN 3
    WHEN daily_limit >= 25 THEN 2
    WHEN daily_limit > 10 THEN 1
    ELSE 0
  END,
  donation_request_id,
  'legacy_donation'
FROM user_daily_limits
WHERE donation_request_id IS NOT NULL
ON CONFLICT(user_id) DO UPDATE SET
  access_level = MAX(user_access_levels.access_level, excluded.access_level),
  donation_request_id = excluded.donation_request_id,
  source = excluded.source,
  updated_at = CURRENT_TIMESTAMP;
