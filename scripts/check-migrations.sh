#!/usr/bin/env sh
set -eu

# Apply every migration to a fresh SQLite database. This catches broken order,
# duplicate-column errors, and SQL syntax before a production D1 release.
CHECK_DIR="$(mktemp -d)"
CHECK_DB="$CHECK_DIR/vocab.sqlite"
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
    (SELECT COUNT(*) FROM pragma_table_info('users') WHERE name = 'acquisition_source');
")"

[ "$EXPECTED_SCHEMA_COUNT" = "13" ] || {
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


echo "Migrations: OK"
