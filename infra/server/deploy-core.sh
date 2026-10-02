#!/usr/bin/env bash
set -euo pipefail

deployment_root="${1:-/opt/ai-attendance}"
cd "${deployment_root}"

compose=(docker compose --env-file infra/.env.staging -f infra/docker-compose.staging.yml)

"${compose[@]}" config --quiet
"${compose[@]}" up -d postgres

for _ in $(seq 1 24); do
  postgres_container="$("${compose[@]}" ps -q postgres)"
  if [[ -n "${postgres_container}" ]] \
    && [[ "$(docker inspect --format='{{.State.Health.Status}}' "${postgres_container}" 2>/dev/null || true)" == "healthy" ]]; then
    break
  fi
  sleep 2
done

if [[ "$(docker inspect --format='{{.State.Health.Status}}' "${postgres_container}")" != "healthy" ]]; then
  echo "PostgreSQL did not become healthy." >&2
  exit 1
fi

"${compose[@]}" build backend migrate sheets-worker
"${compose[@]}" --profile tools run --rm migrate
"${compose[@]}" up -d backend

for _ in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:3000/ready >/dev/null; then
    break
  fi
  sleep 2
done

curl --fail --silent http://127.0.0.1:3000/health
echo
curl --fail --silent http://127.0.0.1:3000/ready
echo
curl --fail --silent http://127.0.0.1:3000/openapi.json >/dev/null
echo "OpenAPI endpoint: PASS"

table_count="$("${compose[@]}" exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*) from information_schema.tables where table_schema = '\''public'\'' and table_type = '\''BASE TABLE'\'';"')"
echo "Public database tables: ${table_count}"

"${compose[@]}" ps
