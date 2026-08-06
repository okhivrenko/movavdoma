# MovaYakVDoma — agent guide

## Portable agent framework

- For clear bounded work, use this file and the closest project instructions;
  do not load the portable routers automatically.
- For multi-step, ambiguous, cross-role, or risk-sensitive work, follow
  `agent-framework/FRAMEWORK.md`. Open `TASK_ROUTING.md` only when ownership is
  unclear and `MODEL_ROUTING.md` only when changing the Terra-medium default or
  considering delegation.
- Applying a role does not require a subagent. One agent is the default and the
  project cap is two concurrent subagents.
- Load only the selected files from `agent-framework/rules/` and `agents/`.
- `PROJECT_AGENT_PROFILE.md` and this file contain app-specific overrides and
  take priority over portable defaults.

## Fast orientation

- Runtime entry point: `worker.js`.
- Network clients: `src/platform/telegram.js`, `src/platform/openai.js`.
- Shared helpers: `src/domain/helpers.js`; vocabulary-list UI:
  `src/features/vocabulary/word-list.js`.
- Pure access-level and donation rules: `src/domain/policies.js`; each unit
  test sits beside its module as `*.test.js`. Shared test helpers live in
  `test-support/`.
- Product behavior and schema: `PROJECT_CONTEXT.md`.
- Release process: `RELEASING.md`.
- Cloudflare config: `wrangler.jsonc`; SQL changes: `migrations/`.
- Runtime changes use `agents/senior-javascript-engineer.md`. Trigger React only
  for React/Next.js; Database for schema/query/data-lifecycle work; Architect
  for cross-app/schema/API/platform boundaries; Security for trust boundaries,
  user data, secrets, dependencies, or abuse; SRE for CI/CD, migrations,
  production, rollback, or incidents; QA for non-trivial behavior; and
  Accessibility for public UI. Exact paths live in `TASK_ROUTING.md` and should
  be opened only when a triggered role is needed.
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
- Access levels set both local-day limits, in the order `word additions/daily
  cards`: `0→10/5`, `1→15/10`, `2→25/15`, `3→40/20`. Admin and temporary
  manual word-addition bonuses remain separate and may only raise that result.
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

- Deliver one complete vertical slice at a time: change, focused tests, full
  gate, then commit/push/deploy when required. Continue accepted slices without
  confirmation; pause only for a material product choice, missing authority, or
  safety boundary.
- Update `IMPLEMENTATION_STATUS.md` only for a completed slice or genuine
  blocker. Finish multi-slice work with an independent final analysis and note
  residual risk or a follow-up owner.

## Context and token discipline

Use context deliberately without weakening investigation or verification.

- Start with `rg`/`rg --files` and read only the exact route, module, test,
  migration, and documentation relevant to the current vertical slice. Do not
  print an entire large file when targeted line ranges answer the question.
- Reuse a compact route/invariant/test map instead of rediscovering files.
- Build and test the extracted feature module first; then replace one complete
  contiguous router block in `worker.js`. Do not leave duplicate transition
  logic after the slice is complete.
- Use focused checks during work; run `npm run check` once per completed slice
  and before commit.
- Keep command output bounded. Request only the needed diff, status, or line
  range; use `git diff --stat` before a full diff.
- Keep subagent packets compact, use `fork_turns = "none"` when self-contained,
  and request summaries instead of raw logs.
- Read skills and project rules once per task, then reopen only a specifically
  relevant section when a new risk or release step requires it.

## Senior engineering quality gate

For every non-trivial feature, refactor, migration, security-sensitive change,
or Cloudflare configuration change, load and apply
`agents/senior-javascript-engineer.md` before committing. The role owns the
quality review; it does not replace the product invariants above. Simple copy
edits and documentation-only changes do not require the full review.
