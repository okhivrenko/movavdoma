# Agent hand-off for a new Telegram bot

Copy the reusable operating rules below to the new repository, then replace
only product-specific facts: bot name, Worker/D1 names, public URL, secrets,
menu wording, quotas, migration history, and supported languages.

## Preserve these constraints

- Use Cloudflare Workers + D1 with `worker.js` as the authenticated composition
  root; use ES modules, not Express.
- Use the `src/domain`, `src/platform`, and `src/features/<feature>` layout.
- Private Telegram chats only; validate callback formats; scope all data by
  Telegram user ID; parameterize every D1 statement with `.bind()`.
- Keep secrets only in Workers Secrets and local `.dev.vars`.
- Add migrations forward-only and apply production migrations through the D1
  migration journal, never raw migration SQL execution.
- Implement a small vertical slice: focused tests, `npm run check`, diff
  inspection, status update, deliberate commit.
- Treat multilingual support as a data model plus UX migration, not merely a
  prompt-language change.

## New-repository bootstrap checklist

1. Create `PROJECT_CONTEXT.md` with current behavior, data ownership, secrets,
   quotas, public URL, and migration history.
2. Copy or adapt `docs/ARCHITECTURE.md` and
   `workflows/cloudflare-telegram-feature.md`.
3. Create `src/domain/languages.js` before the first multilingual feature.
4. Add `worker.test.js` for webhook auth, private chats, and update
   idempotency before adding product features.
5. Put each durable decision in a short ADR before its migration or platform
   change.
