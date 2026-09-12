#!/usr/bin/env bash
# Manuelles Update auf dem NAS (normalerweise macht das nas-update.sh per Zeitplan).
set -euo pipefail
cd "$(dirname "$0")"
git pull --ff-only 2>/dev/null || true
./nas-update.sh
echo "Magnetic_CRM laeuft: $(docker compose ps --format '{{.Status}}' crm)"
