# MovaYakVDoma agent profile

## Product

- Name: MovaYakVDoma.
- User outcome: learn useful English vocabulary in Telegram without managing
  several separate applications.
- Primary surfaces: Telegram bot and public Cloudflare-hosted website.
- Frontend runtime: framework-free server-rendered HTML/CSS unless an ADR
  explicitly introduces React; do not activate the React role for the current
  landing page.
- Product truth source: `PROJECT_CONTEXT.md`.
- Critical invariants: root `AGENTS.md` product invariants.

## Architecture

- Entry point: `worker.js`.
- Boundaries: `docs/ARCHITECTURE.md`.
- Production modules: `src/domain`, `src/platform`, and `src/features`.
- Data: user-owned vocabulary and settings in Cloudflare D1.
- Database engine and migrations: Cloudflare D1/SQLite semantics with versioned
  SQL in `migrations/`; production application follows root `AGENTS.md` and
  `RELEASING.md`.
- External providers: Telegram, OpenAI, DeepL, and Monobank.
- Architecture decisions: `docs/adr/`.

## Risk triggers

- User-owned vocabulary, Telegram profile data, feedback, access grants, and
  donation records require strict ownership and retention controls.
- Telegram webhook secret authenticates inbound updates; admin operations and
  callbacks require explicit authorization.
- Public inputs, providers, donations, schema changes, and production migrations
  require the corresponding framework gates.

## Delivery

- Focused checks: co-located Node tests for the affected module.
- Full check: `npm run check`.
- Feature workflow: `workflows/cloudflare-telegram-feature.md`.
- Release process: `RELEASING.md`.
- Production migration and deploy authority: root `AGENTS.md`.

## Routing overrides

- Load `agents/senior-javascript-engineer.md` for every non-trivial production
  change.
- Load `agents/application-backend-architect.md` for schema, provider,
  cross-feature, multilingual, API-contract, or platform-boundary decisions.
- Load Application Security for auth, admin, payments, user data, public input,
  providers, secrets, dependencies, or retention changes.
- Load SRE for remote migrations, production configuration, deploy, rollback,
  recovery, or incidents.
- Load `agents/database-engineer.md` for schema, index, migration, backfill,
  retention, query-plan, or production-data changes. SRE remains the only owner
  of the production migration gate.
- Load `agents/senior-react-engineer.md` only if a reviewed architecture decision
  adds React or Next.js to a surface.
