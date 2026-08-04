# Migrate the Agent Framework

## Portable core

Copy these paths together:

- `agent-framework/`
- `agents/`
- `.codex/agents/`
- `.codex/config.toml` agent settings, merged with the target project config
- `scripts/install-agent-framework.sh`
- `scripts/audit-agent-token-budget.sh`

Do not copy the source application's `AGENTS.md` or product documentation into a
different app. Create the target `PROJECT_AGENT_PROFILE.md` from the template
and add the integration block below to its root `AGENTS.md`.

## Target integration block

```md
## Portable agent framework

- For non-trivial work, follow `agent-framework/FRAMEWORK.md`.
- Route roles with `agent-framework/TASK_ROUTING.md` and model depth with
  `agent-framework/MODEL_ROUTING.md`.
- Load only the selected files from `agent-framework/rules/` and `agents/`.
- Treat `PROJECT_AGENT_PROFILE.md` and closer nested `AGENTS.md` files as
  project-specific overrides.
```

## Safe installation

From the source repository:

```sh
sh scripts/install-agent-framework.sh /absolute/path/to/target-repository
```

The installer preserves existing unrelated roles and `.codex/config.toml`, but
refuses to overwrite the framework, project profile, installer, or any
same-named role/custom-agent file. Merge deliberately when upgrading an
existing installation.

`agent-framework/skills/react-best-practices/` is a pinned upstream skill. Keep
its `UPSTREAM.md` provenance when copying or updating the framework.

## After copying

1. Fill `PROJECT_AGENT_PROFILE.md` with target-app facts and commands.
2. Keep only the roles the target app needs; project-specific behavior belongs
   in its profile rather than edits to portable roles.
3. Merge `.codex/config.toml`; do not replace sandbox, MCP, or approval settings.
4. Confirm the target account exposes the configured models; adjust only the
   mapping in `MODEL_ROUTING.md` and custom-agent presets.
5. Run the target project's checks and ask Codex to summarize the active
   instruction sources.
6. Run `sh scripts/audit-agent-token-budget.sh` and review any intentional
   budget exception.
7. Version the framework independently and record local overrides.

## Canonical repository

The reusable source is `https://github.com/okhivrenko/codex-agent-framework`.
Install from a reviewed tag or commit, not an unpinned moving branch. The copy
inside an application remains reviewable and may carry explicit local overrides.

## Upgrade strategy

Treat the independent repository as the portable source. Promote a tested
release there, review its diff in each target application, run the target's own
checks, and then commit the vendored update. A plugin may later automate
discovery, but must not hide role, rule, or model changes from repository review.
