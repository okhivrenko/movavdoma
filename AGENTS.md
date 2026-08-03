# MovaYakVDoma — agent guide

## Fast orientation

- Runtime entry point: `worker.js`.
- Network clients: `src/platform/telegram.js`, `src/platform/openai.js`.
- Shared helpers: `src/domain/helpers.js`; vocabulary-list UI:
  `src/features/vocabulary/word-list.js`.
- Pure access-level and donation rules: `src/domain/policies.js`; tests: `test/`.
- Product behavior and schema: `PROJECT_CONTEXT.md`.
- Release process: `RELEASING.md`.
- Cloudflare config: `wrangler.jsonc`; SQL changes: `migrations/`.
- Senior JavaScript review role: `agents/senior-javascript-engineer.md`.
- For reusable Cloudflare-bot architecture and release practice, use the shared
  `$cloudflare-worker-bot` skill. These project-specific rules take priority.

## Architecture map

- Read `docs/ARCHITECTURE.md` before a structural, framework, multilingual, or
  cross-feature decision.
- Run `workflows/cloudflare-telegram-feature.md` for every feature/refactor.
- `worker.js` is the authenticated composition root; production modules live in
  `src/domain`, `src/platform`, and `src/features/<feature>`.
- Use ESM functions and explicit dependencies. Do not add Express, a generic
  repository layer, or OOP classes without a concrete demonstrated need.
- The current direction is English → Ukrainian. `src/domain/languages.js`
  defines planned directions; enabling one requires a neutral schema migration,
  backfill, user selection, prompt/rendering changes, and tests in one slice.

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
- After a user-authorized change that affects bot behavior, configuration, or
  production data, run the required checks and then commit, push, and deploy
  by default. Do not do so only when the user explicitly asks to keep the
  change local, not deploy it, or not push it. Documentation-only changes may
  be pushed without a Worker deployment.

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

## Delivery cadence

- Work in one small, complete vertical slice at a time: implementation or
  extraction, focused tests, full check, then commit/push/deploy when required.
- Do not report a planned action as started until a concrete code or test
  change has been made.
- Update `IMPLEMENTATION_STATUS.md` only after a completed slice or a genuine
  blocker; it is a result monitor, not a stream of intentions.
- After a completed slice, automatically begin the next planned slice without
  requesting confirmation when it stays within the accepted architecture,
  product requirements, and existing deployment authority. Pause only for a
  material product choice, missing access, or a safety boundary that needs the
  owner's direction.
- Do not end a turn merely because one intermediate slice was committed. Keep
  executing the accepted plan until its completion criteria are met or a valid
  pause condition applies.
- At the end of a completed multi-slice objective, perform a final independent
  analysis of the resulting change, update `IMPLEMENTATION_STATUS.md`, and
  create a follow-up plan when residual work or risks remain.

## Senior engineering quality gate

For every non-trivial feature, refactor, migration, security-sensitive change,
or Cloudflare configuration change, load and apply
`agents/senior-javascript-engineer.md` before committing. The role owns the
quality review; it does not replace the product invariants above. Simple copy
edits and documentation-only changes do not require the full review.
