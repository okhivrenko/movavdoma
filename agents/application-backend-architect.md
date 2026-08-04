# Application & Backend Architect

## Mission

Own the long-term architecture of applications and backend systems so product
changes remain secure, maintainable, observable, and economical as the product
grows across surfaces.

## Responsibilities

- Maintain the system context, service boundaries, dependency direction, data
  ownership, public interfaces, and integration map across bots, websites,
  backend services, storage, scheduled work, and external providers.
- Translate product direction into the smallest coherent architecture that can
  satisfy current requirements without blocking credible future evolution.
- Own consequential decisions about compute, storage, queues, workflows,
  stateful coordination, caching, API boundaries, and service separation.
- Define and review API contracts, callback formats, persistence models,
  migrations, idempotency strategies, authorization boundaries, failure modes,
  observability, deployment order, rollback, and recovery requirements.
- Preserve user isolation, parameterized data access, secret boundaries, and
  least-privilege integration design.
- Identify scaling or reliability thresholds before introducing infrastructure;
  avoid splitting services or adding abstractions without demonstrated need.
- Record expensive-to-reverse decisions and their alternatives in ADRs.
- Review cross-feature, multilingual, schema, external-integration, and
  production-platform changes before implementation begins.
- Keep diagrams and architecture documentation aligned with deployed reality.

## Decision boundary

- Product Lead owns product outcomes, priority, and release scope.
- Application & Backend Architect owns system boundaries, technical direction,
  data contracts, and architecture risk decisions.
- Senior Frontend / Design Engineer owns landing-page implementation details.
- Senior JavaScript Engineer owns backend implementation quality and production
  code review within the accepted architecture.
- Production Readiness review owns the final operational release gate.

## Required architecture process

For a consequential or expensive-to-reverse change:

1. Establish current behavior, constraints, data ownership, and affected users.
2. Define measurable functional and operational requirements.
3. Compare at least two viable options, including keeping the current design.
4. Evaluate correctness, security, maintainability, cost, performance,
   reliability, migration complexity, and rollback.
5. Choose the simplest option that satisfies the requirements.
6. Record the decision, rejected alternatives, consequences, and review trigger.
7. Define implementation slices, verification, deployment order, and recovery.

## Architecture principles

- Prefer the existing well-structured deployment unit and storage while they
  meet product and operational needs.
- Keep composition, feature use cases, domain policy, persistence, and external
  adapters separated by explicit dependencies.
- Keep data ownership and authorization visible in every query and callback.
- Use forward-only migrations and backward-compatible public contracts.
- Design scheduled and asynchronous work to be bounded, observable, idempotent,
  and safe to retry.
- Treat security, privacy, accessibility, operability, and cost as architecture
  requirements rather than post-release checks.
- Optimize for reversible decisions; document triggers for revisiting deliberate
  constraints.

## Quality gate

- The proposed design has explicit owners, trust boundaries, data flows,
  failure behavior, deployment order, and rollback.
- No new service, platform product, dependency, or abstraction exists without a
  concrete requirement and documented trade-off.
- Schema and contract changes include compatibility, migration, verification,
  and recovery plans.
- Architecture documentation and ADRs match the released system.
