#!/usr/bin/env sh
set -eu

# Apply every migration to a fresh SQLite database. This catches broken order,
# duplicate-column errors, and SQL syntax before a production D1 release.
CHECK_DIR="$(mktemp -d)"
CHECK_DB="$CHECK_DIR/vocab.sqlite"
UPGRADE_DB="$CHECK_DIR/upgrade.sqlite"
trap 'rm -rf "$CHECK_DIR"' EXIT

for migration in migrations/*.sql; do
  sqlite3 "$CHECK_DB" < "$migration"
done

EXPECTED_SCHEMA_COUNT="$(sqlite3 "$CHECK_DB" "
  SELECT
    (SELECT COUNT(*) FROM pragma_table_info('users') WHERE name = 'interface_version') +
    (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'daily_word_card_views') +
    (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'user_access_levels') +
    (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'user_temporary_access_grants') +
    (SELECT COUNT(*) FROM pragma_table_info('users') WHERE name = 'feedback_pending') +
    (SELECT COUNT(*) FROM pragma_table_info('users') WHERE name = 'feedback_kind') +
    (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'user_messages') +
    (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'shared_word_senses') +
    (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'shared_vocabulary_cards') +
    (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'user_seen_words') +
    (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'referral_rewards') +
    (SELECT COUNT(*) FROM pragma_table_info('words') WHERE name = 'learned_at') +
    (SELECT COUNT(*) FROM pragma_table_info('users') WHERE name = 'acquisition_source') +
    (SELECT COUNT(*) FROM pragma_table_info('daily_word_prefetches') WHERE name = 'cefr_level') +
    (SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_daily_word_generation_jobs_recovery') +
    (SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_daily_word_prefetches_level') +
    (SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_daily_word_prefetch_jobs_recovery') +
    (SELECT COUNT(*) FROM pragma_table_info('donation_requests') WHERE name = 'request_source') +
    (SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_donation_requests_user_source_status');
")"

[ "$EXPECTED_SCHEMA_COUNT" = "19" ] || {
  echo "Expected release schema is missing" >&2
  exit 1
}

# Verify the daily-card invariant enforced by migration 0010. A second pending
# card for the same user and date must be rejected by SQLite/D1.
sqlite3 "$CHECK_DB" "
  INSERT INTO users (telegram_user_id, chat_id) VALUES (1, 1);
  INSERT INTO pending_daily_words (
    user_id, source_text, translation_uk, context_note, examples_json, local_date
  ) VALUES (1, 'first', 'перше', 'meaning', '[]', '2026-08-02');
"

if sqlite3 "$CHECK_DB" "
  INSERT INTO pending_daily_words (
    user_id, source_text, translation_uk, context_note, examples_json, local_date
  ) VALUES (1, 'second', 'друге', 'meaning', '[]', '2026-08-02');
" >/dev/null 2>&1; then
  echo "A duplicate pending daily card was accepted" >&2
  exit 1
fi

# Verify the atomic prefetch-consumption statement used by the Worker. It must
# remove and return only the requested user's current CEFR card.
PREFETCHED_WORD="$(sqlite3 "$CHECK_DB" "
  INSERT INTO daily_word_prefetches (
    user_id, source_text, translation_uk, context_note, examples_json, cefr_level
  ) VALUES (1, 'ready', 'готовий', 'meaning', '[]', 'B1');
  DELETE FROM daily_word_prefetches
  WHERE id = (
    SELECT id FROM daily_word_prefetches
    WHERE user_id = 1 AND cefr_level = 'B1'
    ORDER BY id ASC LIMIT 1
  ) AND user_id = 1
  RETURNING source_text;
")"

[ "$PREFETCHED_WORD" = "ready" ] || {
  echo "Atomic daily-word prefetch consumption failed" >&2
  exit 1
}

# Reproduce the schema state immediately before 0032 with two legitimate active
# jobs for different pending cards. The tightening migration must reconcile the
# duplicate user rows before creating its new unique index.
for migration in migrations/*.sql; do
  case "$migration" in
    migrations/0032_harden_daily_word_prefetch.sql|migrations/0033_separate_manual_bonus_requests.sql) continue ;;
  esac
  sqlite3 "$UPGRADE_DB" < "$migration"
done
sqlite3 "$UPGRADE_DB" "
  INSERT INTO users (telegram_user_id, chat_id) VALUES (2, 2);
  INSERT INTO daily_word_generation_jobs (user_id, chat_id, message_id, pending_id)
  VALUES (2, 2, 10, 100), (2, 2, 11, 101);
"
sqlite3 "$UPGRADE_DB" < migrations/0032_harden_daily_word_prefetch.sql

ACTIVE_JOBS="$(sqlite3 "$UPGRADE_DB" "
  SELECT COUNT(*) FROM daily_word_generation_jobs
  WHERE user_id = 2 AND status IN ('queued', 'processing');
")"
FAILED_JOBS="$(sqlite3 "$UPGRADE_DB" "
  SELECT COUNT(*) FROM daily_word_generation_jobs
  WHERE user_id = 2 AND status = 'failed' AND last_error = 'Superseded by migration 0032';
")"

[ "$ACTIVE_JOBS:$FAILED_JOBS" = "1:1" ] || {
  echo "Daily-word active job reconciliation failed" >&2
  exit 1
}


echo "Migrations: OK"
