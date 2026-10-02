#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" != 0 ]]; then
  echo "Run as root on the new staging VPS." >&2
  exit 1
fi

deployment_root="${1:-/opt/ai-attendance}"
test -f "${deployment_root}/infra/.env.staging"
test -f "${deployment_root}/infra/docker-compose.staging.yml"

install -o root -g root -m 0644 \
  "${deployment_root}/infra/server/ai-attendance-sheets-worker.service" \
  /etc/systemd/system/ai-attendance-sheets-worker.service
install -o root -g root -m 0644 \
  "${deployment_root}/infra/server/ai-attendance-sheets-worker.timer" \
  /etc/systemd/system/ai-attendance-sheets-worker.timer

systemctl daemon-reload
systemctl enable --now ai-attendance-sheets-worker.timer
systemctl start ai-attendance-sheets-worker.service
systemctl is-enabled ai-attendance-sheets-worker.timer
systemctl is-active ai-attendance-sheets-worker.timer
systemctl show ai-attendance-sheets-worker.service -p Result --value
