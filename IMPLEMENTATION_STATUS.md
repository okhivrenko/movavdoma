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

- Version 1.9.5 released on 5 August 2026 vertically centers landing step
  icons with flex alignment. The production CSS asset contains the expected
  `align-items: center` rule. Full tests were intentionally skipped for this
  CSS-only hotfix at the user's request. Cloudflare deployment
  `4c73441b-f76e-4233-8bf9-033d702537da` is live.
- Version 1.9.4 released on 5 August 2026 lets admins read full feedback and
  contact messages from separate paginated lists. Each page shows ten stable
  numbered read buttons, plus previous/next navigation; every detail view
  returns to its original list page. Access remains restricted to private-chat
  admins and record IDs are validated before parameterized reads. `npm run
  check` passed with 82 tests. Cloudflare deployment
  `717c7a21-e788-4ffe-a681-012c177e55fc` returns HTTP 200; the production D1
  journal has no pending migrations.
- Version 1.9.3 released on 5 August 2026 centers landing step icons with flex
  layout and ships the widened Telegram CTA SVG. `npm run check` passed with 80
  tests. Cloudflare deployment `af6f40b0-f41b-46f0-a266-cdb634acb09e`
  serves the landing, updated CSS, and valid SVG with HTTP 200; the production
  D1 journal has no pending migrations.
- Version 1.9.2 released on 4 August 2026 fixes GA4 collection after consent:
  persisted opt-in is restored through `consent update` between the denied
  default and GA4 config, and the landing CSP now permits Google's documented
  GA4/GTM collection hosts while advertising endpoints remain blocked. `npm run
  check` passed with 80 tests. Cloudflare deployment
  `ea602792-0b39-4c7b-b4f3-9f5812378f00` serves HTTP 200 with the expected live
  consent sequence and CSP; the production D1 journal has no pending migrations.
- Version 1.9.1 released on 4 August 2026 fixes Google tag discovery: the canonical
  page now contains the standard `gtag.js?id=G-7S3RWCWPV3` source and queues
  Consent Mode v2 defaults before Google code loads. Analytics storage and all
  advertising consent remain denied by default; cookieless measurements are
  disclosed, full CTA events require opt-in, and withdrawal clears host- and
  domain-scoped GA cookies. `npm run check` passed with 80 tests. Cloudflare
  deployment `295eeba4-05e4-425e-b6a3-e7f4b97a1cbb` serves the tag source and
  versioned consent controller as JavaScript with HTTP 200; the production D1
  journal has no pending migrations.
- Version 1.9.0 released on 4 August 2026: the landing now
  targets the Ukrainian search-intent cluster with canonical/hreflang/social
  metadata, crawl assets, and truthful `WebSite` + `SoftwareApplication`
  structured data. Every CTA uses `https://t.me/MovaVDomaBot`. Consent-first
  Google Analytics (`G-7S3RWCWPV3`) measures page views and Telegram CTA clicks
  only after opt-in, supports later withdrawal, and is covered by the updated
  privacy policy and CSP. Image dimensions, focus handling, security headers,
  and regression tests were improved; `npm run check` passed with 79 tests.
  Cloudflare deployment `da0d45f9-b643-42b0-a68f-ac5940e4c990` serves the
  canonical HTTPS page, analytics asset, robots and sitemap with HTTP 200; the
  production D1 journal has no pending migrations. Live browser Core Web
  Vitals and Tag Assistant validation remain a manual post-release check
  because Chrome DevTools integration was unavailable.
- Version 1.8.0 landing redesign released on 4 August 2026: the public site now
  follows the approved blue-and-gold concept with a responsive hero, Telegram
  phone preview, six feature cards, five-step flow, audience, FAQ, and final
  CTA without a QR code. The supplied SVG pack and vendored Pico CSS live in
  static assets. `npm run check` passed with 74 tests; production HTTPS, HTML,
  CSS, and SVG smoke checks returned HTTP 200. Browser screenshot/reflow QA was
  unavailable in the delivery session and remains a manual visual check.
- Public landing-page slice completed locally on 4 August 2026: `GET /` now
  serves a responsive Ukrainian, framework-free landing page with direct
  Telegram CTAs, privacy link, SEO metadata, and restrictive public-page
  security headers. It adds no tracking, forms, secrets, or D1 changes.
  `npm run check` passed with 74 tests. It was deployed to production as
  Worker version `9f355f59-6f32-4abf-b34d-ad10d4044440`; public `GET /`
  returned HTTP 200 with the expected hero text and security headers.
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
