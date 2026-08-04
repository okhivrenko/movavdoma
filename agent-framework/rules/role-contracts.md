# Role Contract Rules

## Required fields

Every role defines:

- mission;
- responsibilities;
- decision boundary;
- activation triggers;
- quality or release gate;
- whether it is normally read-only, implementation-capable, or operational.

## Separation of concerns

- **Role** defines accountability and judgment.
- **Rule** defines an invariant shared across roles.
- **Workflow** defines sequence and handoffs.
- **Skill** packages a repeatable capability and its resources.
- **Project profile** supplies app-specific facts and commands.
- **Model router** selects execution depth and cost.

Do not duplicate project invariants in every role. Roles reference the active
project profile and add only specialist constraints. When roles disagree, the
lead DRI decides within its boundary; architecture, security, accessibility,
QA, and SRE gates can stop release within their documented scope.

## Handoff contract

Each role returns:

1. evidence inspected;
2. decision or findings;
3. assumptions and residual risk;
4. files or systems affected;
5. recommended next owner and gate.
