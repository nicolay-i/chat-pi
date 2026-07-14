#!/usr/bin/env bash
set -Eeuo pipefail

# Deploy a clean checkout of origin/main. Runtime configuration and persistent
# data stay outside Git in .env.docker and Docker volumes.
repo_dir="${CHAT_PI_REPO_DIR:-/srv/chat-pi}"
branch="${CHAT_PI_DEPLOY_BRANCH:-main}"

cd "$repo_dir"

if [[ ! -d .git ]]; then
  echo "Expected a Git checkout at $repo_dir" >&2
  exit 1
fi

if [[ ! -f .env.docker ]]; then
  echo "Missing $repo_dir/.env.docker" >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
  echo "Refusing to deploy over local changes in $repo_dir" >&2
  exit 1
fi

git fetch --prune origin "$branch"
git checkout "$branch"
git pull --ff-only origin "$branch"

if docker compose version >/dev/null 2>&1; then
  compose=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  compose=(docker-compose)
else
  echo "Docker Compose is not installed" >&2
  exit 1
fi

"${compose[@]}" --env-file .env.docker up --build --detach --remove-orphans
projects_root="$(sed -n 's/^PROJECTS_ROOT=//p' .env.docker | tail -n 1)"
if [[ -n "$projects_root" && -d "$projects_root/chat-pi/.git" ]]; then
  ./scripts/ignore-ignis-vault-state.sh "$projects_root/chat-pi"
fi
"${compose[@]}" --env-file .env.docker ps
