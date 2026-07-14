#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="${1:?Expected the absolute path to an Ignis vault Git repository}"

if [[ ! -d "$repo_dir/.git" ]]; then
  echo "Ignis vault is not a Git repository: $repo_dir" >&2
  exit 1
fi

exclude_file="$(git -c safe.directory="$repo_dir" -C "$repo_dir" rev-parse --path-format=absolute --git-path info/exclude)"
touch "$exclude_file"

for pattern in '.obsidian/' '.OBSIDIANTEST'; do
  grep -Fxq "$pattern" "$exclude_file" || printf '%s\n' "$pattern" >> "$exclude_file"
done
