#!/usr/bin/env bash
# Auf dem Server ausfuehren: holt den neuesten Stand, baut das Image neu
# und startet den Container ohne sichtbare Downtime.
set -euo pipefail
cd "$(dirname "$0")"
git pull --ff-only
docker compose build --pull
docker compose up -d
docker image prune -f >/dev/null
echo "Magnetic_CRM laeuft: $(docker compose ps --format '{{.Status}}' crm)"
