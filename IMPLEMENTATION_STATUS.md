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

- Public landing-page slice completed locally on 4 August 2026: `GET /` now
  serves a responsive Ukrainian, framework-free landing page with direct
  Telegram CTAs, privacy link, SEO metadata, and restrictive public-page
  security headers. It adds no tracking, forms, secrets, or D1 changes.
  `npm run check` passed with 74 tests; deployment verification remains next.
- Portable agent-orchestration framework completed on 4 August 2026: role
  contracts, shared behavioral rules, risk-based task/model routing,
  project-scoped Codex agent presets, a project profile, ADR, and a fail-closed
  migration installer now separate reusable guidance from app-specific facts.
  The installer was verified against a clean temporary repository and refused
  a second installation without overwriting existing files.
- Framework version 0.2.0 adds distinct Senior React and Database Engineer roles,
  executable presets, risk/model routing, and a pinned unmodified Vercel React
  Best Practices skill with upstream provenance. The React role remains inactive
  for the current framework-free landing architecture; D1 changes trigger the
  database role while SRE retains the production migration gate.
- Framework version 0.2.1 reduces token cost: routine presets now use Terra
  medium, narrow exploration uses Luna low, concurrent subagents are capped at
  two, role activation no longer implies delegation, and skills use a strict
  progressive-disclosure budget instead of loading compiled references.
- Active-vocabulary controls made safer on 4 August 2026: example buttons now
  use the `📘` prefix and the separate mark-as-learned buttons use `✅`, so the
  two identical numbered blocks are visually distinct. `npm run check` passed
  with 72 tests; no database migration was required.
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
- Feedback-history slice released on 4 August 2026: feedback and contact
  messages are stored independently and the admin panel shows separate lists
  of 10 entries with next/back navigation. Migration `0020` was applied before
  the Worker deployment.
- Translation-quality slice released on 4 August 2026: DeepL now translates
  English ↔ Ukrainian text and vocabulary-card content, while OpenAI generates
  only senses and English examples with the stronger `gpt-5.4-mini` default.
  Shared vocabulary cache migration `0021` was applied before deployment.
