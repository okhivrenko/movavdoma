# Project agent profile

## Product

- Name: `<app name>`
- User outcome: `<one sentence>`
- Primary surface: `<web / mobile / bot / API>`
- Frontend runtime: `<none / HTML-CSS / React / Next.js / other>`
- Product truth source: `<path>`
- Critical invariants: `<path or concise list>`

## Architecture

- Entry points: `<paths>`
- Module boundaries: `<paths or summary>`
- Data ownership and storage: `<summary>`
- Database engine and migration path: `<engine, paths, apply command>`
- External providers: `<list>`
- Architecture docs and ADRs: `<paths>`

## Risk triggers

- Sensitive data: `<none or types>`
- Authentication/authorization: `<summary>`
- Payments/admin/public input: `<summary>`
- Regulatory/accessibility requirements: `<summary>`

## Delivery

- Focused checks: `<commands>`
- Full check: `<command>`
- Release process: `<path>`
- Production owner and approval boundary: `<summary>`
- Rollback/recovery: `<path>`

## Routing overrides

- Required roles by area: `<only project-specific overrides>`
- React activation: `<paths or explicitly inactive>`
- Database activation: `<paths and risk triggers>`
- Model-tier overrides: `<rare; explain evidence>`
- Files that require nested `AGENTS.md`: `<paths>`
