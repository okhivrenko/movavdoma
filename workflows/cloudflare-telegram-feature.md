# Cloudflare Telegram feature workflow

Use this workflow for a feature, refactor, migration, or multilingual change.

1. Read `AGENTS.md`, `docs/ARCHITECTURE.md`, `PROJECT_CONTEXT.md`, the related
   ADR, matching feature module, tests, and migration history.
2. State the smallest accepted vertical slice and its invariants. Do not change
   user behavior as part of a folder-only refactor.
3. Put pure logic in `src/domain`, external I/O in `src/platform`, and use-case
   logic in the relevant `src/features/<feature>` folder. Keep `worker.js` as
   composition root.
4. For Telegram callbacks: validate syntax, preserve private-chat handling, and
   scope every read/update by Telegram user ID. Use `.bind()` for every D1
   parameter.
5. For D1 changes: add the next numbered migration. Never amend a shipped one.
   Apply remote migrations only with `wrangler d1 migrations apply` and check
   the journal before and after.
6. Add focused tests beside the relevant feature test. Add a Worker HTTP test
   when webhook authentication, routing, or cross-feature composition changes.
7. Run `npm run check`, then inspect `git diff --check` and the final diff.
8. Update `PROJECT_CONTEXT.md`, an ADR, and `IMPLEMENTATION_STATUS.md` only
   after the slice is complete. Commit deliberately; deploy only when behavior,
   configuration, or production data changed and release gates are met.

## Efficient context loop

For a refactor, make a compact route map with `rg -n` before reading source.
Read bounded file ranges and the matching feature tests, define one contiguous
router block to replace, then implement the destination module and its focused
tests first. Run focused tests after the patch; reserve `npm run check` for
the completed vertical slice. This reduces repeated context without skipping
security, ownership, migration, or release checks.

## Multilingual additions

Treat a new translation direction as a data-contract change. It requires a
direction-neutral schema, backfill, direction selection, OpenAI prompt changes,
legacy-card compatibility, and tests in the same release sequence.
