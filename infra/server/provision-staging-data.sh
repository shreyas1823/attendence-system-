#!/usr/bin/env bash
set -euo pipefail

deployment_root="${1:-/opt/ai-attendance}"
cd "${deployment_root}"
compose=(docker compose --env-file infra/.env.staging -f infra/docker-compose.staging.yml)
credential_directory="${deployment_root}/.device-credentials"
credential_file="${credential_directory}/attendance-staging-01.json"

install -d -m 0700 -o root -g root "${credential_directory}"

if [[ ! -e "${credential_file}" ]]; then
  chown 10001:10001 "${credential_directory}"
  "${compose[@]}" --profile tools run --rm \
    -v "${credential_directory}:/app/.device-credentials" \
    migrate node dist/cli/provision-device.js \
    --device-id ATTENDANCE-STAGING-01 \
    --name "AI Attendance Staging Device" \
    --output attendance-staging-01.json
fi

chown root:root "${credential_directory}" "${credential_file}"
chmod 0700 "${credential_directory}"
chmod 0600 "${credential_file}"
"${compose[@]}" --profile tools run --rm migrate node dist/cli/seed-staging-student.js

echo "Staging device and synthetic student are provisioned."
stat -c '%U %G %a %n' "${credential_file}"
