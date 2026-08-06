-- One referred account can reward at most one existing referrer. Rewards are
-- evaluated against the referrer's stored local date, not UTC or the invitee.
CREATE TABLE IF NOT EXISTS referral_rewards (
  referrer_user_id INTEGER NOT NULL,
  referred_user_id INTEGER NOT NULL UNIQUE,
  local_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (referrer_user_id, referred_user_id),
  CHECK (referrer_user_id <> referred_user_id),
  FOREIGN KEY (referrer_user_id) REFERENCES users(telegram_user_id),
  FOREIGN KEY (referred_user_id) REFERENCES users(telegram_user_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_active
  ON referral_rewards(referrer_user_id, local_date);
