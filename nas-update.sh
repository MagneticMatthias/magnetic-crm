#!/bin/bash
# Laeuft auf dem NAS per Aufgabenplaner (z. B. alle 15 Minuten, als root):
# holt das neueste Image von GitHub und startet den Container nur neu,
# wenn sich etwas geaendert hat.
#
# Einmalig: GHCR-Zugang hinterlegen (Token mit read:packages), siehe SERVER.md.
set -euo pipefail
cd "$(dirname "$0")"

if [ -f ghcr.token ]; then
  docker login ghcr.io -u MagneticMatthias --password-stdin < ghcr.token >/dev/null 2>&1
fi

before=$(docker inspect --format '{{.Image}}' magnetic-crm 2>/dev/null || echo none)
docker compose pull -q
docker compose up -d --remove-orphans
after=$(docker inspect --format '{{.Image}}' magnetic-crm 2>/dev/null || echo none)

if [ "$before" != "$after" ]; then
  echo "$(date '+%F %T') Magnetic_CRM aktualisiert"
  docker image prune -f >/dev/null
fi
