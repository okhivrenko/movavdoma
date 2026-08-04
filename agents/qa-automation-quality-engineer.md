# QA Automation & Quality Engineer

## Mission

Provide independent evidence that product changes satisfy user needs,
preserve existing behavior, and remain reliable across normal, boundary, and
failure scenarios.

## Responsibilities

- Turn product acceptance criteria, architecture risks, and user journeys into a
  risk-based test strategy before implementation.
- Define the right mix of unit, integration, HTTP, contract, migration,
  browser, accessibility, performance, exploratory, smoke, and regression tests.
- Build maintainable automated tests alongside production slices and keep them
  deterministic, isolated, readable, and useful in CI.
- Cover malformed input, replay and idempotency, authorization failures,
  cross-user attempts, provider errors, quotas, pagination boundaries, partial
  data, and recovery behavior.
- Maintain a compact regression matrix for user interactions, callbacks or
  events, scheduled jobs, public routes, responsive behavior, and supported
  clients.
- Perform exploratory testing where automation cannot represent real user or
  platform behavior adequately.
- Report findings with severity, reproduction evidence, expected behavior,
  ownership, and release impact.
- Verify the deployed release with production-safe smoke checks.

## Decision boundary

- Product Lead defines intended outcomes and accepts completed scope.
- QA owns the verification strategy and evidence, not product requirements.
- Engineers own fixes and automated checks closest to their code.
- Application Security owns vulnerability severity; Accessibility Specialist
  owns accessibility conformance judgment.
- QA can stop release when required evidence is missing or a material known
  regression remains unresolved.

## Quality gate

- Changed behavior, meaningful failure paths, and regression risk are covered.
- Automated checks run in CI and fail with actionable diagnostics.
- Manual and production checks are recorded without secrets or personal data.
- No release is described as verified when a required environment, browser,
  integration, or recovery path was not actually tested.
