# MovaYakVDoma — agent guide

## Portable agent framework

- For every non-trivial request, follow `agent-framework/FRAMEWORK.md`.
- Route the lead role and triggered gates with
  `agent-framework/TASK_ROUTING.md`.
- Select the lowest sufficient model and agent count with
  `agent-framework/MODEL_ROUTING.md`; one agent is the default.
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
- Senior JavaScript review role: `agents/senior-javascript-engineer.md`.
- Senior React role: `agents/senior-react-engineer.md`; activate it only for
  React/Next.js work and pair it with the pinned Vercel guidance at
  `agent-framework/skills/react-best-practices/SKILL.md`.
- Database role: `agents/database-engineer.md`; use it for schema, SQL, indexes,
  transactions, migrations, backfills, retention, and recovery design.
- Application and backend architecture role:
  `agents/application-backend-architect.md`; use it before cross-application,
  schema, API-contract, external-integration, service-boundary, or consequential
  Cloudflare platform decisions.
- Application security role: `agents/application-security-engineer.md`; use it
  for public endpoints, authentication, authorization, user data, providers,
  dependencies, secrets, abuse controls, and security-sensitive releases.
- Platform, delivery, and reliability role:
  `agents/platform-devops-sre-engineer.md`; use it for CI/CD, Cloudflare
  environments, migrations, observability, incident response, rollback, and
  production releases.
- Quality engineering role: `agents/qa-automation-quality-engineer.md`; use it
  to define risk-based verification, automation, regression coverage, and
  release evidence for non-trivial behavior changes.
- Accessibility assurance role: `agents/accessibility-specialist.md`; use it
  for public UI, content, responsive experiences, core user journeys, and
  pre-release accessibility review.
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

## Context and token discipline

Use context deliberately without weakening investigation or verification.

- Start with `rg`/`rg --files` and read only the exact route, module, test,
  migration, and documentation relevant to the current vertical slice. Do not
  print an entire large file when targeted line ranges answer the question.
- Record the slice's source range, invariants, owner module, and required
  tests before editing. Reuse that compact map rather than rediscovering the
  same code after every patch.
- Build and test the extracted feature module first; then replace one complete
  contiguous router block in `worker.js`. Do not leave duplicate transition
  logic after the slice is complete.
- Use focused tests and syntax checks after each small patch. Run `npm run
  check` once per completed slice and before its commit, rather than after
  unrelated exploratory changes.
- Keep command output bounded. Request only the needed diff, status, or line
  range; use `git diff --stat` before a full diff.
- Read skills and project rules once per task, then reopen only a specifically
  relevant section when a new risk or release step requires it.

## Senior engineering quality gate

For every non-trivial feature, refactor, migration, security-sensitive change,
or Cloudflare configuration change, load and apply
`agents/senior-javascript-engineer.md` before committing. The role owns the
quality review; it does not replace the product invariants above. Simple copy
edits and documentation-only changes do not require the full review.
