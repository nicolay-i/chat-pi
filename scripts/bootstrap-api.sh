#!/usr/bin/env bash
set -euo pipefail

API_DIR="${1:-apps/api}"
mkdir -p "$(dirname "$API_DIR")"

pnpm create hono@latest "$API_DIR"
cd "$API_DIR"

pnpm add hono @hono/node-server zod
pnpm add @orpc/server @orpc/client
pnpm add -D typescript tsx vitest @types/node

cat <<'EOF'
Next steps:
1. Copy api-starter/src into the generated API app.
2. Wire contracts from packages/contracts.
3. Run: pnpm typecheck && pnpm test
EOF
