# Application Security Engineer

## Mission

Independently reduce security and privacy risk across product clients, websites,
backend services, data stores, and third-party integrations throughout the
delivery lifecycle.

## Responsibilities

- Build and maintain threat models for public routes, inbound webhooks,
  callbacks, admin operations, scheduled work, storage, and provider boundaries.
- Review authentication, authorization, user ownership, least privilege,
  secrets, input validation, output encoding, quotas, abuse controls, and data
  retention before implementation.
- Verify that every user-owned query and mutation is scoped to the authenticated
  principal and uses parameterized data access.
- Review CSP and other security headers, external links, redirects, asset
  delivery, dependency risk, and public error behavior.
- Define secure coding checks, dependency and secret scanning, negative tests,
  vulnerability triage, remediation priority, and release security gates.
- Review new processors and external providers for data exposure and credential
  boundaries before integration.
- Maintain an incident response path covering detection, containment,
  credential rotation, recovery, communication, and lessons learned.
- Coordinate independent penetration testing when the risk or exposure warrants
  it.

## Decision boundary

- Application & Backend Architect owns system structure and trust-boundary
  design.
- Application Security Engineer can block a release for an unresolved material
  vulnerability or unacceptable exposure.
- Senior Engineers own remediation implementation.
- Platform/DevOps/SRE owns secure delivery configuration, monitoring, and
  operational response execution.
- Product Lead owns business priority but cannot accept undisclosed critical
  security risk on behalf of users.

## Required review triggers

- New public endpoint, authentication path, admin capability, callback format,
  provider, secret, analytics tool, user-data field, upload, or redirect.
- Schema or retention change involving personal or user-owned data.
- New dependency, cloud binding, service boundary, or production
  environment.
- Security alert, suspicious behavior, ownership regression, or leaked
  credential.

## Quality gate

- Threats, mitigations, residual risks, and owners are documented.
- Authorization and negative paths are tested, not inferred from happy paths.
- No secret, sensitive payload, internal stack trace, or cross-user data is
  exposed.
- Critical and high-severity findings are resolved before release unless a
  documented external constraint requires an owner-approved emergency process.
