# MovaVDoma — project context

## Purpose

A personal Telegram bot for learning English vocabulary.

Users add words through Telegram. The bot:

- translates words into Ukrainian;
- provides two English example sentences and Ukrainian translations;
- keeps each user’s vocabulary isolated by Telegram user ID;
- supports choosing the intended meaning for ambiguous words through Telegram inline buttons;
- will later send scheduled daily reviews and support spaced repetition.

## Current infrastructure

- Hosting/runtime: Cloudflare Workers
- Database: Cloudflare D1 (SQLite)
- Worker name: `movavdoma`
- Public URL: `https://movavdoma.oleksiikhivrenko.workers.dev/`
- D1 database name: `vocab-words-db`
- D1 database ID: `62ded422-e125-42b3-99de-a86fdcf5f9f8`
- Telegram receives updates through a webhook.
- The webhook must accept both `message` and `callback_query` updates.
- The scheduled Worker configures the current public webhook URL once through
  the existing Telegram secrets. This safely repairs the webhook after a
  workers.dev subdomain or Worker-name migration without exposing the token.

## Secrets

Never commit or print these values:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `OPENAI_API_KEY`
- `DEEPL_API_KEY` — currently no longer used by the latest card-generation flow, but remains configured in Cloudflare.
- `MONOBANK_API_TOKEN` — personal Monobank API token used only to read the configured jar statement.

## Current Worker behavior

### `/start`

Welcomes the user and shows a persistent reply keyboard with:

- `➕ Додати слово`
- `📚 Мої слова`
- `🎓 Вивчені слова`
- `📚 Щоденне слово`
- `⏰ Розклад і рівень`
- `❓ Допомога`
- `💬 Відгук`
- `➡️ Далі` / `⬅️ Назад` split the persistent menu into two pages. The second
  page has support, bonus, feedback, contact, and the admin entry point.

The admin also sees `🛠 Адмін`, which opens an admin-only panel with a paginated
user list, the `/grant <userId> <dailyLimit>` format, and a summary of
admin-only commands. It can also show a copyable direct bot link. The user
list includes Telegram IDs, active-word count, and the current daily limit.

Users can simply send an English word or phrase; `/add` remains supported.
`/menu` shows the keyboard again if it was hidden.

To specify an exact meaning, users can send `word | context`, for example:

```text
charge | payment for a service
```

### `/add resilient`

For a word without explicit context:

1. Ask OpenAI for one to nine common distinct meanings.
2. If there is one meaning, immediately generate the vocabulary card.
3. If there are multiple meanings, show inline Telegram buttons.
4. Show three meanings per page.
5. Support `Ще значення →` and `← Назад`.
6. After the user taps a meaning, generate one coherent card:
    - Ukrainian translation for the chosen meaning;
    - two English example sentences;
    - Ukrainian translation for each sentence.
7. Save the word and examples to D1.

### `/add charge | payment for a service`

When an explicit context is supplied, skip meaning selection and generate the card immediately for that context.

### `/list`

Shows the ten most recently added active words for the current Telegram user,
with inline buttons to view examples or mark each word as learned. Examples are
shown in a separate message to keep the list compact.

### Legacy commands: `/delete 1`, `/delete 5-10`, `/delete all`

Marks one word, an inclusive range of positions from the current `/list`, or
all active words as learned. `/archive` remains a backwards-compatible alias.

### `🎓 Вивчені слова`, `/learned`, and `/restore`

The menu button and `/learned` show up to ten learned words per page with
numbered restore buttons. Selecting one returns it to the active learning
catalog. Learned words are retained for 30 days after being marked learned,
then a daily cleanup permanently removes them with their examples and review
history. Active words have no total cap and are never removed by this cleanup.
`/restore 1`, `/restore 5-10`, and `/restore all` remain supported for bulk
restoration. The learned-word view shows up to 10 words per page, with numbered
restore buttons and next/previous navigation. Learned words remain in D1 with
`is_active = 0`.

### Daily word

`📚 Щоденне слово` shows the current pending card or generates a new one.
After `Знаю` or `Вчити`, the user can open another card on the same day. The
number of newly generated cards depends on access level: 5, 10, 15, or 20.
`⏰ Розклад і рівень` opens a two-step settings flow: choose
whether to change the delivery time or CEFR level (A0–C2), then choose its
value. It can also turn reminders on or off. The card has `Знаю` and `Вчити`
buttons: `Знаю` discards it, while `Вчити` adds the card and examples to the
user's active vocabulary.
The default timezone is `Europe/Warsaw`; Telegram does not provide a user's
timezone to a bot. A Cloudflare Cron Trigger runs every minute in UTC, while
the Worker compares each user's configured hour in their stored timezone. It
uses `last_delivery_local_date` to send no more than one daily word per local
date.

### Support and bonuses

- The keyboard offers `☕ Підтримати бот` and `🎁 Отримати бонус`.
- Before a donation, the bot gives the user a short unique code to put in the
  Monobank payment comment. The public jar is configured in `worker.js`.
- A scheduled task reads that jar's statement at most once per minute. Every
  transaction ID is stored, so overlapping statement windows cannot notify or
  process the same payment twice.
- A matching donation creates an admin-only Telegram review card. The bot
  recommends access level 1, 2, or 3 from the matched amount, but the admin
  chooses the final level; nothing is granted automatically.
- An approved donation grants an access level for one month. It never lowers a
  higher permanent level. A donation without a matching code is still sent to
  the admin as an unmatched-payment alert.
- When a donation grant expires, the bot thanks the user, invites further
  support, and offers the `💬 Відгук` flow. The user's next plain-text message
  is sent to the admin and acknowledged.

## Important UX rules

- Never mix senses of a word in one card.
- Do not show more than three meaning buttons per page.
- If a user starts a new `/add` while a previous meaning choice is open:
    - close the previous inline-button message;
    - replace it with: `Вибір скасовано: ти почав додавати інше слово.`
    - the old word must not be saved.
- Ignore group chats; support private chats only.
- Each user must see only their own words.

## OpenAI integration

- Model: `gpt-5.4-nano`
- API: Chat Completions API with structured JSON output.
- Reasoning effort: `none`.
- Generate translation and examples in one OpenAI response so all content uses the same selected meaning.
- Do not independently translate the word through another provider after the user selects a sense.

## Access and cost control

- The bot accepts private chats from multiple Telegram users; every user's
  words remain isolated by Telegram user ID.
- Users other than the account identified by the Cloudflare secret
  `ADMIN_TELEGRAM_USER_ID` can add up to 10 words per local day.
- The admin can manually grant any positive daily limit for one calendar month
  with `/grant <telegramUserId> <dailyLimit>`, for example
  `/grant 123456789 45`. The target user must have started the bot first.
- The quota is atomically claimed before any OpenAI call. Failed OpenAI calls
  still count because they may already have consumed API tokens.
- Choosing `Вчити` for a daily card also uses one addition from that day's
  limit; choosing `Знаю` does not.
- `daily_word_additions` stores only the user ID, local date, and count.
- `daily_word_card_views` independently limits newly generated daily cards to
  five per local day; it does not reduce the ten-word learning-list quota.
- `user_access_levels` stores a permanent manual/legacy level. Temporary
  donation grants live in `user_temporary_access_grants`; the highest active
  level determines the limit: 0→5, 1→10, 2→15, and 3→20 daily cards. The
  admin can permanently raise a level with `/level <telegramUserId> <0-3>`.
- `/testlevel <telegramUserId>` grants level 1 for one day to exercise the
  temporary-access flow without creating a donation reminder.

## D1 binding

The Worker code expects the D1 binding name:

```text
DB
```

## Database schema

```sql
CREATE TABLE IF NOT EXISTS users (
  telegram_user_id INTEGER PRIMARY KEY,
  chat_id INTEGER NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Warsaw',
  daily_time TEXT NOT NULL DEFAULT '09:00',
  daily_enabled INTEGER NOT NULL DEFAULT 1,
  daily_level TEXT NOT NULL DEFAULT 'B1',
  is_active INTEGER NOT NULL DEFAULT 1,
  last_delivery_local_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_word_additions (
  user_id INTEGER NOT NULL,
  local_date TEXT NOT NULL,
  additions INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, local_date),
  FOREIGN KEY (user_id) REFERENCES users(telegram_user_id)
);

CREATE TABLE IF NOT EXISTS user_daily_limits (
  user_id INTEGER PRIMARY KEY,
  daily_limit INTEGER NOT NULL,
  donation_request_id INTEGER,
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS donation_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  support_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'awaiting_payment',
  requested_at TEXT,
  matched_transaction_id TEXT,
  granted_daily_limit INTEGER,
  admin_notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  granted_at TEXT
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  transaction_id TEXT PRIMARY KEY,
  amount_kopiykas INTEGER NOT NULL,
  transaction_time INTEGER NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  matched_request_id INTEGER,
  admin_notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS monobank_sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  jar_id TEXT,
  jar_send_id TEXT,
  last_attempt_at INTEGER NOT NULL DEFAULT 0,
  last_successful_sync_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  source_text TEXT NOT NULL,
  source_language TEXT NOT NULL DEFAULT 'en',
  translation_uk TEXT,
  context_note TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(telegram_user_id)
);

CREATE INDEX IF NOT EXISTS idx_words_user_created
  ON words(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS examples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER NOT NULL,
  sentence_source TEXT NOT NULL,
  sentence_uk TEXT NOT NULL,
  position INTEGER NOT NULL,
  FOREIGN KEY (word_id) REFERENCES words(id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  shown_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  answer TEXT,
  next_review_at TEXT,
  FOREIGN KEY (word_id) REFERENCES words(id),
  FOREIGN KEY (user_id) REFERENCES users(telegram_user_id)
);

CREATE TABLE IF NOT EXISTS processed_updates (
  update_id INTEGER PRIMARY KEY,
  processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pending_words (
  user_id INTEGER PRIMARY KEY,
  source_text TEXT NOT NULL,
  senses_json TEXT NOT NULL,
  chat_id INTEGER,
  message_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(telegram_user_id)
);

CREATE TABLE IF NOT EXISTS pending_daily_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  source_text TEXT NOT NULL,
  translation_uk TEXT NOT NULL,
  context_note TEXT NOT NULL,
  examples_json TEXT NOT NULL,
  local_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## Local development requirements

- Keep the Worker code in `worker.js`.
- Keep the SQL above in `migrations/0001_initial.sql`.
- Use a local D1 database during development.
- Do not commit `.dev.vars`, API keys, Telegram tokens, or Cloudflare secrets.
- Do not rerun the initial migration against the existing production D1 database: its tables were already created manually in Cloudflare.
- Future schema changes should be added as new numbered migrations.
- Before deploying quota support to production, execute only
  `migrations/0002_add_daily_word_additions.sql` against the remote D1 database;
  do not run the whole migration history.
- Before deploying support bonuses to production, execute only
  `migrations/0003_add_donation_bonus_support.sql` against the remote D1 database;
  do not run the whole migration history.
- Then execute only `migrations/0004_add_bonus_expiration.sql` against the
  remote D1 database.
- Then execute only `migrations/0005_add_daily_word_preferences.sql` against
  the remote D1 database.
- Then execute only `migrations/0006_add_pending_daily_word_date.sql` against
  the remote D1 database.
- Then execute only `migrations/0007_add_interface_version.sql` and
  `migrations/0008_add_daily_word_card_limit.sql` against the remote D1
  database.
- Then execute `migrations/0009_add_user_access_levels.sql` against the remote
  D1 database.
- Then execute `migrations/0010_enforce_one_pending_daily_word.sql` against
  the remote D1 database before deploying the corresponding Worker code.
- Then execute `migrations/0011_add_temporary_access_grants.sql` against the
  remote D1 database before deploying the corresponding Worker code.
- Then execute `migrations/0012_add_feedback_and_test_access.sql` against the
  remote D1 database before deploying the corresponding Worker code.
- Long-lived technical decisions are recorded in `docs/adr/`.

## Next product features

1. Daily word card with buttons:
    - `Знаю`
    - `Повторити завтра`
    - `Не знаю`
4. Use the `reviews` table for spaced repetition.
5. Add archive restoration, `/pause`, `/resume`, and word editing.

## NEVER READ NEXT FILES (STR)
.dev.var
