# Vocabulary Telegram Bot — project context

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
- Worker name: `vocab-telegram-bot`
- Public URL: `https://vocab-telegram-bot.alexeykhivrenko.workers.dev/`
- D1 database name: `vocab-words-db`
- D1 database ID: `62ded422-e125-42b3-99de-a86fdcf5f9f8`
- Telegram receives updates through a webhook.
- The webhook must accept both `message` and `callback_query` updates.

## Secrets

Never commit or print these values:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `OPENAI_API_KEY`
- `DEEPL_API_KEY` — currently no longer used by the latest card-generation flow, but remains configured in Cloudflare.

## Current Worker behavior

### `/start`

Explains how to add a word.

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
with an inline delete button for each word.

### `/delete 1`, `/delete 5-10`, `/delete all`

Soft-deletes one word, an inclusive range of positions from the current
`/list`, or all active words. `/archive` remains a backwards-compatible alias.

### `/archived` and `/restore`

`/archived` shows up to ten soft-deleted words with inline restore buttons.
`/restore 1`, `/restore 5-10`, and `/restore all` return selected archived words
to the active catalog. Soft-deleted words remain in D1 with `is_active = 0`.

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
  is_active INTEGER NOT NULL DEFAULT 1,
  last_delivery_local_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
```

## Local development requirements

- Keep the Worker code in `worker.js`.
- Keep the SQL above in `migrations/0001_initial.sql`.
- Use a local D1 database during development.
- Do not commit `.dev.vars`, API keys, Telegram tokens, or Cloudflare secrets.
- Do not rerun the initial migration against the existing production D1 database: its tables were already created manually in Cloudflare.
- Future schema changes should be added as new numbered migrations.

## Next product features

1. `/time 09:00` — choose daily delivery time.
2. Cloudflare scheduled trigger — checks which users are due a word.
3. Daily word card with buttons:
    - `Знаю`
    - `Повторити завтра`
    - `Не знаю`
4. Use the `reviews` table for spaced repetition.
5. Add archive restoration, `/pause`, `/resume`, and word editing.

## NEVER READ NEXT FILES (STR)
.dev.var
