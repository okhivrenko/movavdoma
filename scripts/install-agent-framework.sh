#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: sh scripts/install-agent-framework.sh /absolute/path/to/target-repository" >&2
  exit 2
fi

target_repo=$1
case "$target_repo" in
  /*) ;;
  *) echo "Target must be an absolute path." >&2; exit 2 ;;
esac

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
source_repo=$(CDPATH= cd -- "$script_dir/.." && pwd)

if [ ! -d "$target_repo" ]; then
  echo "Target repository does not exist: $target_repo" >&2
  exit 2
fi

for target_path in \
  "$target_repo/agent-framework" \
  "$target_repo/PROJECT_AGENT_PROFILE.md" \
  "$target_repo/scripts/install-agent-framework.sh"
do
  if [ -e "$target_path" ]; then
    echo "Refusing to overwrite existing path: $target_path" >&2
    exit 1
  fi
done

for source_file in "$source_repo"/agents/*.md
do
  target_file="$target_repo/agents/$(basename -- "$source_file")"
  if [ -e "$target_file" ]; then
    echo "Refusing to overwrite existing role: $target_file" >&2
    exit 1
  fi
done

for source_file in "$source_repo"/.codex/agents/*.toml
do
  target_file="$target_repo/.codex/agents/$(basename -- "$source_file")"
  if [ -e "$target_file" ]; then
    echo "Refusing to overwrite existing custom agent: $target_file" >&2
    exit 1
  fi
done

mkdir -p "$target_repo/.codex/agents" "$target_repo/agents" "$target_repo/scripts"
cp -R "$source_repo/agent-framework" "$target_repo/agent-framework"
cp "$source_repo"/agents/*.md "$target_repo/agents/"
cp "$source_repo"/.codex/agents/*.toml "$target_repo/.codex/agents/"
cp "$source_repo/agent-framework/templates/PROJECT_AGENT_PROFILE.template.md" \
  "$target_repo/PROJECT_AGENT_PROFILE.md"
cp "$source_repo/scripts/install-agent-framework.sh" \
  "$target_repo/scripts/install-agent-framework.sh"

if [ ! -e "$target_repo/.codex/config.toml" ]; then
  cp "$source_repo/.codex/config.toml" "$target_repo/.codex/config.toml"
else
  echo "Kept existing .codex/config.toml; merge agent settings manually."
fi

echo "Installed portable agent framework into: $target_repo"
echo "Next: fill PROJECT_AGENT_PROFILE.md and add the integration block from agent-framework/MIGRATION.md to AGENTS.md."
