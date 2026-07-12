FROM node:24-bookworm-slim AS dependencies

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN pnpm install --frozen-lockfile

FROM dependencies AS verify

COPY apps/api apps/api
COPY apps/mobile apps/mobile
COPY packages/contracts packages/contracts

RUN pnpm --filter @pi-agents/contracts typecheck \
  && pnpm --filter @pi-agents/api typecheck

FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ARG PI_VERSION=0.80.3

RUN apt-get update \
  && apt-get install --no-install-recommends -y bubblewrap git \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && npm install --global --no-audit --no-fund "@earendil-works/pi-coding-agent@${PI_VERSION}" \
  && pi --version \
  && mkdir -p /data/pi-agent /projects \
  && chown -R node:node /data /projects

COPY --from=verify --chown=node:node /app /app

ENV NODE_ENV=production
ENV PORT=8787
ENV DB_PATH=/data/app.db
ENV PI_BIN=/usr/local/bin/pi
ENV PI_CODING_AGENT_DIR=/data/pi-agent

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

USER node

CMD ["pnpm", "--filter", "@pi-agents/api", "start"]
