#!/bin/bash
set -Eeuo pipefail

# This directory is a persistent named volume, so copy the source-controlled
# wrapper after Docker mounts it and before Ignis starts serving static files.
cp /opt/chat-pi/embed.html /app/obsidian-app/embed.html

exec /app/apps/ignis-server/scripts/entrypoint.sh "$@"
