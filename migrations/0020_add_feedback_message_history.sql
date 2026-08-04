ALTER TABLE users
  ADD COLUMN feedback_kind TEXT NOT NULL DEFAULT 'feedback'
  CHECK (feedback_kind IN ('feedback', 'contact'));

CREATE TABLE user_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('feedback', 'contact')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(telegram_user_id)
);

CREATE INDEX idx_user_messages_type_created
  ON user_messages(message_type, created_at DESC, id DESC);
