# Task-to-Role Router

Select one lead DRI. Supporting roles must own a distinct deliverable or gate.
Applying a role does not imply spawning an agent; keep roles in the primary
thread unless parallel evidence or independent assurance is worth the extra
context.

| Task type | Lead role | Add when triggered | Typical tier |
| --- | --- | --- | --- |
| Product direction, scope, positioning, KPI | Product Lead | Research, Content, SEO/Growth | Balanced |
| User journey, information architecture, visual UX | Senior Product Designer | Research, Content, Accessibility, Frontend | Balanced |
| User interviews or usability validation | UX Researcher | Product, Design, Content | Balanced |
| Landing/product copy and microcopy | Content Designer | Product, SEO/Growth, Accessibility | Efficient/Balanced |
| Social campaign and distribution | Social Content Strategist | Product, Content, SEO/Growth | Efficient/Balanced |
| Search discovery and acquisition measurement | SEO & Growth Specialist | Content, Frontend, Product | Balanced |
| Frontend/UI implementation | Senior Frontend / Design Engineer | Design, Accessibility, QA, Security | Balanced |
| React/Next.js components, hooks, RSC, hydration, or bundle work | Senior React Engineer | Frontend, Accessibility, QA, Security | Balanced |
| Backend feature or refactor | Senior JavaScript Engineer | Architect, QA, Security | Balanced/Deep |
| Architecture, data contract, service/platform boundary | Application & Backend Architect | Security, SRE, affected engineers | Deep |
| Schema, SQL, index, transaction, migration, backfill, or recovery design | Database Engineer / Data Architect | Architect, Security, SRE, backend, QA | Balanced/Deep |
| Threat model, auth, user data, admin, payments, providers | Application Security Engineer | Architect, QA, implementation owner | Deep |
| Test strategy, regression, release evidence | QA Automation & Quality Engineer | Security, Accessibility, implementation owner | Balanced |
| Accessibility conformance or core public journey | Accessibility Specialist | Design, Content, QA, Frontend | Balanced |
| CI/CD, migration apply, release, monitoring, incident | Platform / DevOps / SRE Engineer | Architect, Security, QA, backend | Deep |
| Read-only codebase exploration | Explorer | relevant lead role consumes summary | Efficient |

## Activation rules

- Do not activate a role because its title sounds relevant; activate it because
  it owns a named decision, artifact, evidence set, or gate.
- Architecture is mandatory for cross-application, schema, external provider,
  service-boundary, or expensive-to-reverse decisions.
- React is activated only when the target surface uses React or Next.js; keep a
  framework-free surface framework-free unless a documented requirement changes
  that architecture.
- Database is mandatory for consequential schema changes, production data
  transformations, transaction/concurrency risks, or query-plan regressions.
- Security is mandatory for auth, admin, secrets, user data, payments, public
  inputs, dependencies, or new external processors.
- SRE is mandatory for remote migrations, production configuration, release,
  rollback, recovery, or incident work.
- QA is mandatory for non-trivial behavior changes; implementation engineers
  may write the tests, while QA owns the risk model and evidence.
- Accessibility is mandatory for public UI and core user journeys.
- Documentation-only edits do not activate implementation, SRE, or security
  roles unless they change operational instructions or security policy.
