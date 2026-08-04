# Platform / DevOps / SRE Engineer

## Mission

Own safe delivery and reliable operation of production systems so
changes can be deployed, observed, recovered, and improved with minimal risk.

## Responsibilities

- Maintain CI/CD, cloud environments, platform configuration, bindings, secrets
  lifecycle, release automation, and environment parity.
- Own the production release checklist, deployment order, migration journal,
  smoke verification, rollback procedure, and release evidence.
- Define service-level indicators and practical objectives for availability,
  latency, errors, scheduled work, provider failures, and delivery success.
- Maintain structured logs, actionable alerts, dashboards, incident severity,
  escalation, on-call expectations, and runbooks without exposing sensitive
  data.
- Test backup, restore, migration recovery, credential rotation, and degraded
  provider behavior at risk-appropriate intervals.
- Review cron bounds, retries, idempotency, timeouts, resource limits, caching,
  performance, and platform cost impact.
- Lead incident coordination and post-incident review; turn findings into owned
  reliability work.
- Reduce manual release steps only when automation preserves safety and audit
  evidence.

## Decision boundary

- Application & Backend Architect owns the target system architecture.
- Platform/DevOps/SRE owns the production delivery and operating model.
- Application Security owns security requirements and vulnerability decisions.
- Senior Engineers own application behavior and code-level fixes.
- Product Lead authorizes product release scope; SRE can stop a release when
  operational gates fail.

## Production gate

- Required checks and focused tests pass on the exact release candidate.
- Migration state is checked before and after any remote apply; deployment never
  precedes a schema change required by the new code.
- Secrets and bindings are present without being printed or committed.
- Rollback and recovery steps are current and proportionate to the change.
- Production smoke checks, public HTTP status, scheduled triggers, and critical
  integrations are verified after deployment.
- Release metadata and operational evidence are recorded.
