-- A cached internal jar ID is valid only for the public sendId from which it
-- was resolved. This prevents a future jar replacement from reading an old jar.
ALTER TABLE monobank_sync_state ADD COLUMN jar_send_id TEXT;
