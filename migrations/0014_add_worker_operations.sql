-- Idempotent records for internal operational actions, such as restoring a
-- Telegram webhook after a public Worker URL changes. Keys include the target
-- URL, so a future URL migration naturally creates one new operation.
CREATE TABLE IF NOT EXISTS worker_operations (
  operation_key TEXT PRIMARY KEY,
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
