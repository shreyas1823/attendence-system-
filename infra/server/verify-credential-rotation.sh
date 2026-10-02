#!/usr/bin/env bash
set -euo pipefail

deployment_root="${1:-/opt/ai-attendance}"
cd "${deployment_root}"
compose=(docker compose --env-file infra/.env.staging -f infra/docker-compose.staging.yml)
credential_directory="${deployment_root}/.device-credentials"
credential_file="${credential_directory}/attendance-staging-01.json"
device_id="ATTENDANCE-STAGING-01"

old_credential="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["credential"])' "${credential_file}")"
chown 10001:10001 "${credential_directory}" "${credential_file}"
"${compose[@]}" --profile tools run --rm \
  -v "${credential_directory}:/app/.device-credentials" \
  migrate node dist/cli/rotate-staging-device.js \
  "${device_id}" attendance-staging-01.json
chown root:root "${credential_directory}" "${credential_file}"
chmod 0700 "${credential_directory}"
chmod 0600 "${credential_file}"

new_credential="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["credential"])' "${credential_file}")"
"${compose[@]}" restart backend >/dev/null

for _ in $(seq 1 20); do
  curl --fail --silent http://127.0.0.1:3000/ready >/dev/null && break
  sleep 1
done

old_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  -H 'content-type: application/json' -H "x-device-id: ${device_id}" \
  -H "Authorization: Bearer ${old_credential}" \
  --data '{"eventType":"HEARTBEAT"}' http://127.0.0.1:3000/api/v1/device/heartbeat)"
new_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  -H 'content-type: application/json' -H "x-device-id: ${device_id}" \
  -H "Authorization: Bearer ${new_credential}" \
  --data '{"eventType":"HEARTBEAT"}' http://127.0.0.1:3000/api/v1/device/heartbeat)"

echo "revoked_credential=${old_status} replacement_credential=${new_status}"
[[ "${old_status}/${new_status}" == "401/200" ]]
stat -c '%U %G %a %n' "${credential_file}"
