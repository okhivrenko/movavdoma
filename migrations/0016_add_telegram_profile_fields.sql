-- Profile fields are supplied by Telegram with private messages. They are
-- informational only and let the administrator distinguish users with IDs.
ALTER TABLE users ADD COLUMN telegram_username TEXT;
ALTER TABLE users ADD COLUMN telegram_first_name TEXT;
