-- The manual daily-word menu may refresh an unanswered card no more than once
-- every 12 hours for each user.
ALTER TABLE users
  ADD COLUMN last_daily_word_menu_opened_at TEXT;
