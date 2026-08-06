-- A manual bonus request is reviewed by an admin without implying that a
-- Monobank payment exists. Existing requests retain the historical support
-- source so statement matching stays limited to payment-linked requests.
ALTER TABLE donation_requests
  ADD COLUMN request_source TEXT NOT NULL DEFAULT 'support'
  CHECK (request_source IN ('support', 'manual_bonus'));

CREATE INDEX IF NOT EXISTS idx_donation_requests_user_source_status
  ON donation_requests(user_id, request_source, status);
