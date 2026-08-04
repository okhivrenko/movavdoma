# Model and Reasoning Router

## Principle

Choose the lowest-cost configuration that reliably meets the task's risk and
quality requirements. Model choice is task-specific, not a status property of a
role. A senior role does not automatically require the deepest model for a
simple bounded task.

## Stable capability tiers

| Tier | Use | Current Codex mapping |
| --- | --- | --- |
| Efficient | clear, repeatable, read-heavy, or mechanical work | GPT-5.6 Luna low/medium when available; otherwise GPT-5.6 Terra low |
| Balanced | normal implementation, product/content work, debugging, focused review | GPT-5.6 Terra medium/high |
| Deep | ambiguous architecture, security, migrations, cross-system design, difficult incident analysis | GPT-5.6 Sol high/xhigh |
| Independent gate | high-impact review where independence matters | GPT-5.6 Sol high in a read-only agent distinct from the implementer |

If a named model is unavailable, select the nearest available model by tier.
Keep this table as the only project-independent place that maps tiers to model
names, because available models change.

## Risk score

Score each dimension from 0 to 2:

- **Blast radius:** one file/pure copy → feature → cross-system/production.
- **Reversibility:** trivial revert → coordinated revert → migration/data loss
  or externally visible contract.
- **Security/data:** none → user-facing/user data → authorization, secrets,
  payments, admin, or sensitive data.
- **Ambiguity:** exact task → some design judgment → unknown requirements or
  multiple consequential options.

| Total | Default route |
| --- | --- |
| 0–2 | Efficient or Balanced, low/medium, one agent |
| 3–5 | Balanced, medium/high, one agent; add one bounded specialist only when it owns distinct evidence |
| 6–8 | Deep, high/xhigh; require independent review and the applicable release gate |

Raise the tier when verification evidence is weak. Lowering the tier is allowed
only when the task is narrowed or made more reversible.

## Role defaults

| Work | Default tier | Notes |
| --- | --- | --- |
| Repository mapping, file discovery, evidence collection | Efficient | read-only explorer; return a compact route map |
| Copy edit, formatting, extraction, structured summary | Efficient | one agent; no specialist unless facts need review |
| Product brief, UX, content, SEO plan | Balanced | medium by default; high for competing evidence or major positioning |
| Bounded frontend or backend implementation | Balanced | high for cross-feature logic or difficult debugging |
| React component, hook, RSC, hydration, or bundle work | Balanced | Terra high; use Vercel rules selectively and measure optimization claims |
| Routine SQL/query review within an established schema | Balanced | Terra high; escalate when integrity, concurrency, or production data is at risk |
| Focused tests and regression matrix | Balanced | use Efficient only for deterministic mechanical additions |
| Architecture, consequential schema/migration, API contract, provider or platform choice | Deep | Sol high/xhigh; compare options before implementation |
| Application security and threat modeling | Deep | read-only independent reviewer for material changes |
| Production migration, incident, rollback, recovery | Deep | SRE lead with architecture/security support as triggered |
| Final review of a high-risk change | Independent gate | never use the implementation agent as the only reviewer |

## Agent-count policy

- **One agent is the default** and usually uses the fewest tokens.
- Use two agents when a bounded investigation can run independently or when a
  materially risky change needs independent review.
- Use three agents only when the work has genuinely independent streams, such
  as implementation, security review, and QA evidence.
- More than three subagents requires an explicit task-specific justification.
- Never spawn several roles merely to have each repeat the same code reading.
- Prefer read-heavy parallel work; serialize agents that would edit overlapping
  files.

## Context and fork policy

- Use `fork_turns = "none"` for a task packet that contains all required local
  context and when selecting a different model.
- Use a small positive fork only when recent conversation decisions are
  essential and expensive to restate.
- Avoid full-history forks for supporting agents; they increase context cost and
  can obscure ownership.
- A task packet contains: objective, owned files or evidence, invariants,
  constraints, done criteria, and required output format.

## Escalation examples

- Text-only landing-page copy adjustment: one Balanced agent, medium.
- Responsive CSS bug with clear reproduction: one Balanced frontend agent,
  high; add QA only if core navigation or accessibility is affected.
- New schema migration with user-owned data: Deep architect or backend lead plus
  Database Engineer and independent security/QA review; SRE owns production
  application.
- Isolated React component with an established pattern: one Balanced React
  Engineer; load only matching Vercel rule files after its skill index.
- Production outage: Deep SRE lead; add backend or provider specialist only for
  a distinct hypothesis.
