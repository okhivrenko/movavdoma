# Delegation Rules

- Default to one agent.
- Do not spawn for a single-file change, routine copy, formatting, a short
  lookup, or a task the primary agent must immediately redo to integrate.
- Delegate only a concrete, bounded subtask that can progress independently or
  provides necessary independent assurance.
- Give each writing agent exclusive file or module ownership. Agents are not
  alone in the repository and must preserve others' changes.
- Do not ask multiple agents to rediscover the same code path.
- Prefer explorers for targeted read-only questions and workers for explicit
  implementation ownership.
- Keep architecture, security, QA, and review agents read-only unless the task
  explicitly assigns them a fix.
- Wait for required gate results before release or final completion.
- The primary agent owns synthesis, conflicts, final verification, and user
  communication.
- Stop delegation when coordination cost exceeds the remaining work.
- Use at most two concurrent subagents by default. A third requires explicit
  user direction or a documented high-risk need and a configuration change.
