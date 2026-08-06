-- Keep TikTok campaign values bounded without rebuilding the production users
-- table, whose earlier CHECK constraint permits only the legacy tiktok_ads
-- value. New campaigns are recorded only for newly created users by the Worker.
CREATE TABLE user_acquisition_campaigns (
  user_id INTEGER PRIMARY KEY,
  campaign TEXT NOT NULL CHECK (campaign IN ('tiktok_ads', 'tiktok_story')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(telegram_user_id)
);

CREATE INDEX idx_user_acquisition_campaigns_campaign
  ON user_acquisition_campaigns(campaign);
