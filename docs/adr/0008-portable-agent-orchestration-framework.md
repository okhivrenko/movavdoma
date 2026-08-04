# ADR 0008: Portable risk-based agent orchestration

## Status

Accepted on 4 August 2026.

## Context

The project has specialist role documents but no shared policy for selecting a
model, deciding when delegation adds value, separating role rules from project
rules, or carrying the setup to another application. A flat project-only setup
encourages loading every role and overusing high-reasoning or parallel agents.

## Options considered

1. Keep all guidance in the root `AGENTS.md`. Simple, but it grows quickly,
   loads unnecessary context, and is difficult to reuse without product leakage.
2. Install a global skill or plugin immediately. Easy to reuse after packaging,
   but harder to iterate with project history and easy to hide from repository
   review.
3. Keep a versioned portable core with a thin project profile and optional
   project-scoped custom-agent presets.

## Decision

Use option 3. `agent-framework/` owns routing, shared behavioral rules,
workflow, migration guidance, and templates. `agents/` owns role contracts.
`PROJECT_AGENT_PROFILE.md` and root/nested `AGENTS.md` own application facts and
overrides. `.codex/agents/` maps common execution agents to current model tiers.
Repeatable expert guidance lives under `agent-framework/skills/`; third-party
skills are pinned to an upstream commit with provenance and are loaded only when
their trigger applies.

Single-agent execution is the default. Delegation is limited to bounded
independent work or required independent assurance. Model selection uses stable
capability tiers, with current model names isolated in one router and optional
presets.

## Consequences

- The framework can be copied without copying MovaYakVDoma product rules.
- Roles and behavioral rules have distinct ownership and load only on demand.
- Model configuration can change without rewriting every role.
- The repository carries more small instruction files and needs deliberate
  versioning when shared across applications.
- React-specific implementation is separated from platform-neutral frontend
  work, and database engineering is separated from architecture and production
  operations.
- A plugin or shared skill remains a future packaging step after the framework
  proves stable in more than one application.

## Migration and rollback

Use `scripts/install-agent-framework.sh` for a fail-closed first install and
complete the generated project profile. Rollback consists of removing the
portable paths and their root `AGENTS.md` integration block; application code
and runtime behavior are unaffected.

## Acceptance criteria

- A task can be routed to one lead role and a lowest-sufficient model tier.
- The default agent count is one and delegation triggers are explicit.
- Shared rules, role contracts, workflows, and project facts are separate.
- Installation refuses to overwrite existing target framework files.
- A second app can adopt the framework by copying the portable paths and filling
  one project profile.
