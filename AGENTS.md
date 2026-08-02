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
- Do not deploy, push, tag, or change Cloudflare settings unless explicitly
  requested by the user.

## Product invariants

- A vocabulary card must use one selected meaning and exactly two examples.
- Base learning-list quota: 10 words per local day; admin and temporary manual
  bonuses are separate.
- Daily-card quota is separate and uses access levels: `0→5`, `1→10`,
  `2→15`, `3→20` newly generated cards per local day.
- Access levels only rise through donations or `/level`; do not downgrade a
  user implicitly.
- The Telegram reply keyboard is versioned with `INTERFACE_VERSION`. Increment
  it only when persistent menu buttons change.

## Required checks

Run before committing a feature:

```bash
npm run check
```

For a production release, follow `RELEASING.md` and verify the public Worker
returns HTTP 200 after deployment.
