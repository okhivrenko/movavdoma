# Release Safety Rules

- Separate implementation authority from production-change authority.
- Release only the exact reviewed candidate.
- Apply required schema changes before code that reads them.
- Verify migrations, secrets, bindings, checks, observability, rollback, and
  recovery before deployment.
- Run production-safe smoke checks after deployment and record evidence.
- Security, QA, Accessibility, or SRE may stop release for a material finding
  within its gate.
- Never weaken a gate only to finish within a token, time, or usage budget.
