# Vocabulary Bot — agent guide

## Fast orientation

- Runtime entry point: `worker.js`.
- Network clients: `telegram.js`, `openai.js`.
- Shared helpers: `helpers.js`; vocabulary-list UI: `word-list.js`.
- Pure access-level and donation rules: `policies.js`; its unit tests: `test/`.
- Product behavior and schema: `PROJECT_CONTEXT.md`.
- Release process: `RELEASING.md`.
- Cloudflare config: `wrangler.jsonc`; SQL changes: `migrations/`.
- For reusable Cloudflare-bot architecture and release practice, use the shared
  `$cloudflare-worker-bot` skill. These project-specific rules take priority.

## Non-negotiable rules

- Never print, commit, or replace secrets. Keep `.dev.vars` local.
- Only private Telegram chats are supported. Preserve user-ID ownership checks
  for every callback and SQL query.
- Keep SQL parameterized with `.bind()`; do not interpolate user input.
- Do not edit an existing migration after it has reached production. Add the
  next numbered migration instead.
- Production D1 changes must be applied before code that reads them.
- Use `wrangler d1 migrations apply <database> --remote` as the only way to
  apply versioned production migrations. Never use `d1 execute --file` for a
  file from `migrations/`, because it bypasses the `d1_migrations` journal.
- Before and after every production migration, run `wrangler d1 migrations
  list <database> --remote`; deployment may continue only when the final check
  reports no pending migrations.
- Do not deploy, push, tag, or change Cloudflare settings unless explicitly
  requested by the user.

## Product invariants

- A vocabulary card must use one selected meaning and exactly two examples.
- Base learning-list quota: 10 words per local day; admin and temporary manual
  bonuses are separate.
- Daily-card quota is separate and uses access levels: `0→5`, `1→10`,
  `2→15`, `3→20` newly generated cards per local day.
- Base access levels only rise through `/level`. Donation levels are separate,
  expire after one month, and never reduce a higher base level.
- Feedback requires the explicit `💬 Відгук` flow; forward only that user's next
  plain-text message to the admin and then clear the pending state.
- The Telegram reply keyboard is versioned with `INTERFACE_VERSION`. Increment
  it only when persistent menu buttons change.

## Required checks

Run before committing a feature:

```bash
npm run check
```

For a production release, follow `RELEASING.md` and verify the public Worker
returns HTTP 200 after deployment.
