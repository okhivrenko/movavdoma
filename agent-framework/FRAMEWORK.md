# Portable Agent Orchestration Framework

## Purpose

Route each task to the smallest capable combination of model, role, rules, and
workflow. Optimize first for correctness at the required risk level, then for
token use, latency, and parallelism.

## Instruction layers

Keep these concerns separate:

1. `AGENTS.md` — durable repository facts, commands, invariants, and entry-point
   routing.
2. `PROJECT_AGENT_PROFILE.md` — application-specific architecture, risk, and
   release pointers.
3. `agent-framework/rules/` — portable behavioral invariants shared by roles.
4. `agents/` — role contracts: mission, responsibility, decision rights, and
   quality gates.
5. `agent-framework/workflows/` — ordering and handoff checkpoints.
6. `agent-framework/skills/` — portable repeatable capabilities and their
   references; load only when triggered.
7. `.codex/agents/` — optional executable custom-agent presets and model
   defaults.
8. `.codex/rules/*.rules` — command approval policy only; never put product or
   engineering guidance there.

More specific project instructions override portable defaults. Security rules
override convenience, correctness overrides cost optimization, and explicit
user instructions override defaults unless unsafe or impossible.

## Minimal routing loop

For multi-step, ambiguous, cross-role, or risk-sensitive work:

1. Classify the request and its risk. Open `TASK_ROUTING.md` only when ownership
   or required gates are unclear.
2. Select the lead role and only the supporting roles with a concrete output.
3. Use Terra medium for normal work. Open `MODEL_ROUTING.md` only when choosing
   another tier, delegation, or an independent gate.
4. Default to one agent. Delegate only bounded, independent work or an
   independent high-risk review.
5. Load only the rules and role files selected for the task.
6. Follow `workflows/delivery.md` and the closest project workflow.
7. Verify the outcome and report actual evidence, not intended checks.

For clear single-file, copy, formatting, or established-pattern work, skip this
router and use the closest project instructions directly.

## Context budget

- Always load: root instructions. Open only the exact project profile section
  needed for the task.
- Routine task budget: at most one role and two shared rule modules. Do not load
  both routers when the route and tier are already obvious.
- Skill budget: read `SKILL.md`, then at most two relevant references on the
  first pass. Never read a compiled all-rules document when individual
  references exist.
- Do not load every role or every framework module by default.
- Prefer a compact task packet over forwarding full conversation history.
- Return summaries and file references from subagents, not raw exploration or
  long command output.
- Activating a specialist role means applying its contract; it does not require
  spawning a separate agent. Spawn only when independent work or assurance
  repays the duplicated context and synthesis cost.

## When to evolve the framework

Update a shared rule after the same cross-role failure repeats. Update a role
when accountability or decision rights are unclear. Add a workflow only for a
repeatable multi-step process. Create a skill when the same workflow is invoked
across projects often enough to justify automatic triggering and bundled tools.
