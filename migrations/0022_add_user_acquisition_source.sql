ALTER TABLE users
  ADD COLUMN acquisition_source TEXT
  CHECK (acquisition_source IS NULL OR acquisition_source IN ('ig_bio', 'ig_story', 'tg_ads', 'tg_post', 'website'));

CREATE INDEX idx_users_acquisition_source
  ON users(acquisition_source)
  WHERE acquisition_source IS NOT NULL;
