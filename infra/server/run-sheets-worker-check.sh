#!/usr/bin/env bash
set -euo pipefail

deployment_root="${1:-/opt/ai-attendance}"
cd "${deployment_root}"
compose=(docker compose --env-file infra/.env.staging -f infra/docker-compose.staging.yml)

"${compose[@]}" --profile tools run --rm sheets-worker
"${compose[@]}" --profile tools run --rm sheets-worker
"${compose[@]}" exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select status || '\''='\'' || count(*) from outbox_jobs group by status order by status; select '\''sheet_sync_state='\'' || count(*) from sheet_sync_state;"'
