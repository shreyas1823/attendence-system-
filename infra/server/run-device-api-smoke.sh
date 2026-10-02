#!/usr/bin/env bash
set -euo pipefail

deployment_root="${1:-/opt/ai-attendance}"
cd "${deployment_root}"
compose=(docker compose --env-file infra/.env.staging -f infra/docker-compose.staging.yml)
credential_file="${deployment_root}/.device-credentials/attendance-staging-01.json"

device_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["deviceIdentifier"])' "${credential_file}")"
credential="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["credential"])' "${credential_file}")"
base_url="http://127.0.0.1:3000/api/v1/device"
run_id="$(date +%s)"

request() {
  local method="$1" url="$2" body="$3" auth="$4"
  local -a headers=(-H 'content-type: application/json' -H "x-device-id: ${device_id}")
  if [[ "${auth}" == "valid" ]]; then
    headers+=(-H "Authorization: Bearer ${credential}")
  elif [[ "${auth}" == "invalid" ]]; then
    headers+=(-H 'Authorization: Bearer deliberately-invalid-staging-credential')
  fi
  curl --silent --output /dev/null --write-out '%{http_code}' \
    -X "${method}" "${headers[@]}" --data "${body}" "${url}"
}

heartbeat="$(request POST "${base_url}/heartbeat" '{"eventType":"HEARTBEAT"}' valid)"
missing="$(request POST "${base_url}/heartbeat" '{"eventType":"HEARTBEAT"}' missing)"
invalid="$(request POST "${base_url}/heartbeat" '{"eventType":"HEARTBEAT"}' invalid)"
unknown="$(request POST "${base_url}/attendance" "{\"eventId\":\"live-${run_id}-unknown\",\"fingerprintId\":127,\"occurredAt\":\"2026-09-20T08:00:00+05:30\",\"eventType\":\"ATTENDANCE\"}" valid)"
malformed="$(request POST "${base_url}/attendance" '{}' valid)"

first_body="{\"eventId\":\"live-${run_id}-first\",\"fingerprintId\":101,\"occurredAt\":\"2026-09-20T09:05:00+05:30\",\"eventType\":\"ATTENDANCE\"}"
second_body="{\"eventId\":\"live-${run_id}-second\",\"fingerprintId\":102,\"occurredAt\":\"2026-09-20T14:03:00+05:30\",\"eventType\":\"ATTENDANCE\"}"
third_body="{\"eventId\":\"live-${run_id}-third\",\"fingerprintId\":101,\"occurredAt\":\"2026-09-20T15:00:00+05:30\",\"eventType\":\"ATTENDANCE\"}"

first="$(request POST "${base_url}/attendance" "${first_body}" valid)"
replay="$(request POST "${base_url}/attendance" "${first_body}" valid)"
second="$(request POST "${base_url}/attendance" "${second_body}" valid)"
third="$(request POST "${base_url}/attendance" "${third_body}" valid)"

rate_limited=0
for _ in $(seq 1 35); do
  status="$(request POST "${base_url}/heartbeat" '{"eventType":"HEARTBEAT"}' valid)"
  if [[ "${status}" == "429" ]]; then rate_limited=1; break; fi
done

printf 'heartbeat=%s missing=%s invalid=%s unknown=%s malformed=%s first=%s replay=%s second=%s third=%s rate_limited=%s\n' \
  "${heartbeat}" "${missing}" "${invalid}" "${unknown}" "${malformed}" \
  "${first}" "${replay}" "${second}" "${third}" "${rate_limited}"

if [[ "${heartbeat}/${missing}/${invalid}/${unknown}/${malformed}/${first}/${replay}/${second}/${third}/${rate_limited}" \
  != "200/401/401/404/400/201/200/201/409/1" ]]; then
  echo "Device API smoke-test expectations failed." >&2
  exit 1
fi

"${compose[@]}" exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select '\''attendance_records='\'' || count(*) from attendance_records where event_id like '\''live-%'\''; select '\''device_event_receipts='\'' || count(*) from device_event_receipts where event_id like '\''live-%'\''; select '\''attendance_outbox='\'' || count(*) from outbox_jobs where event_type = '\''attendance.recorded'\'';"'
