-- Keep the prior bounded source constraint intact while making TikTok visible
-- separately in reports. A campaign is stored only when the user is created.
ALTER TABLE users
  ADD COLUMN acquisition_campaign TEXT
  CHECK (acquisition_campaign IS NULL OR acquisition_campaign IN ('tiktok_ads'));

CREATE INDEX idx_users_acquisition_campaign
  ON users(acquisition_campaign)
  WHERE acquisition_campaign IS NOT NULL;
