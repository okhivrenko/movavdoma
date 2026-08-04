#!/bin/sh
set -eu

framework_root=${1:-.}

count_words() {
  wc -w < "$framework_root/$1" | tr -d ' '
}

check_limit() {
  relative_path=$1
  maximum=$2
  actual=$(count_words "$relative_path")
  if [ "$actual" -gt "$maximum" ]; then
    echo "FAIL $relative_path: $actual words exceeds $maximum" >&2
    exit 1
  fi
  echo "OK   $relative_path: $actual/$maximum words"
}

check_limit AGENTS.md 1000
check_limit agent-framework/FRAMEWORK.md 650
check_limit agent-framework/TASK_ROUTING.md 700
check_limit agent-framework/MODEL_ROUTING.md 1000

for role_file in "$framework_root"/agents/*.md
do
  relative_role=${role_file#"$framework_root"/}
  check_limit "$relative_role" 900
done

for agent_file in "$framework_root"/.codex/agents/*.toml
do
  relative_agent=${agent_file#"$framework_root"/}
  check_limit "$relative_agent" 180
done

thread_cap=$(awk -F '=' '/max_concurrent_threads_per_session/ { gsub(/[[:space:]]/, "", $2); print $2 }' "$framework_root/.codex/config.toml")
if [ -z "$thread_cap" ] || [ "$thread_cap" -gt 2 ]; then
  echo "FAIL subagent concurrency cap must be present and <= 2" >&2
  exit 1
fi

if grep -R -E 'model_reasoning_effort = "(xhigh|max|ultra)"' "$framework_root/.codex/agents" >/dev/null 2>&1; then
  echo "FAIL custom agent permanently pins an exceptional reasoning tier" >&2
  exit 1
fi

react_rule_count=$(find "$framework_root/agent-framework/skills/react-best-practices/rules" -type f -name '*.md' ! -name '_*' | wc -l | tr -d ' ')
if [ "$react_rule_count" -ne 70 ]; then
  echo "FAIL expected 70 pinned React rules, found $react_rule_count" >&2
  exit 1
fi

echo "OK   subagent concurrency cap: $thread_cap"
echo "OK   exceptional reasoning is selected per task, not pinned"
echo "OK   React skill exposes 70 focused rules via progressive disclosure"
echo "Token-budget audit passed (word counts are a context-size proxy, not billing telemetry)."
