# Implementation status

This file is a small, human-readable progress monitor for completed delivery
slices and genuine blockers. It is not a stream of intentions.

## Current work

- **Stage:** feature-first modular architecture
- **State:** production code is organized into `src/domain`, `src/platform`,
  and feature folders. `worker.js` is the authenticated HTTP/webhook
  composition root. The multilingual catalog is prepared, while the active
  vocabulary direction remains English → Ukrainian; a separate ephemeral
  Ukrainian ↔ English text translator is available from the main menu.
- **Next concrete action:** deliver the first selected multilingual direction
  only as a complete data, UX, prompt, rendering, and test slice; see
  `docs/DEVELOPER_GUIDE_UA.md` and `docs/ARCHITECTURE.md`.

## Plan

- [x] Requirements test matrix and baseline Worker HTTP tests
- [x] Local test command and GitHub Actions workflow
- [x] Extract daily settings with tests
- [x] Extract vocabulary-card generation, sense selection, and persistence
- [x] Extract access-level reads and monotonic grant operations
- [x] Test and extract daily-card delivery
- [x] Extract feedback state and delivery flow
- [x] Extract donation grant operation
- [x] Extract donation notifications and review operations
- [x] Cover remaining admin, feedback, learned-word, and scheduled-job flows
- [x] Extract daily-addition quota operations
- [x] Route callbacks and stable admin commands by feature
- [x] Final decomposition security and reliability review
- [x] Move production modules into feature-first folders
- [x] Document the dependency boundaries, manual development workflow, and
  deliberate scaling path
- [x] Co-locate module tests with their production modules; keep only shared
  helpers in `test-support/` and composition tests beside `worker.js`
- [x] Add Ukrainian content catalog and stable navigation action foundation for
  a future interface locale
- [x] Reduce `worker.js` to webhook composition by extracting navigation,
  privacy rendering, and vocabulary text-command flows
- [ ] Follow-up: release the first multilingual direction as a complete
  direction-neutral data-contract change.
- [x] Add bounded Ukrainian ↔ English text translation without changing
  vocabulary-card storage.

## Latest verified result

- `npm run check`: 58 tests passed, migrations validated, Worker dry-run built.
- Version 1.5.0 deployed on 3 August 2026: the bounded Ukrainian ↔ English
  translation flow and updated menu are live. Production migration `0017` was
  applied before deployment, the D1 journal has no pending migrations, and the
  public Worker returned HTTP 200.
- Timezone and settings-label slice verified locally on 4 August 2026: new and
  migrated users default to `Europe/Kyiv`; `⏰ Налаштування` offers a paginated
  whitelist of popular IANA timezones with their dynamic GMT offset. `npm run
  check` passed with 60 tests. Migration `0018` and this UI update were
  deployed to production; the D1 journal has no pending migrations and the
  public Worker returned HTTP 200.
- Admin activity-monitoring slice deployed on 4 August 2026: the user directory
  shows the latest private bot interaction and sorts by it. `npm run check`
  passed with 61 tests. Migration `0019` was applied before the Worker deploy;
  the D1 journal has no pending migrations and the public Worker returned HTTP
  200.
