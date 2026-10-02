#!/usr/bin/env bash
set -euo pipefail

deployment_root="${1:-/opt/ai-attendance}"
environment_file="${deployment_root}/infra/.env.staging"

if [[ -e "${environment_file}" ]]; then
  echo "Staging environment already exists; leaving it unchanged."
  exit 0
fi

umask 077
database_password="$(openssl rand -hex 32)"
session_secret="$(openssl rand -hex 48)"
disabled_sheets_secret="$(openssl rand -hex 32)"

cat > "${environment_file}" <<EOF
NODE_ENV=staging
HOST=0.0.0.0
PORT=3000
POSTGRES_DB=ai_attendance_staging
POSTGRES_USER=ai_attendance
POSTGRES_PASSWORD=${database_password}
DATABASE_URL=postgresql://ai_attendance:${database_password}@postgres:5432/ai_attendance_staging
SESSION_SECRET=${session_secret}
CORS_ORIGINS=
LOG_LEVEL=info
TIME_ZONE=Asia/Kolkata
DEVICE_ATTENDANCE_RATE_LIMIT=120
DEVICE_HEARTBEAT_RATE_LIMIT=30
DEVICE_RATE_LIMIT_WINDOW_MS=60000
REQUEST_BODY_LIMIT_BYTES=16384
SHEETS_ADAPTER_URL=https://invalid.local/disabled
SHEETS_ADAPTER_SECRET=${disabled_sheets_secret}
SHEETS_ADAPTER_TIMEOUT_MS=15000
SHEETS_WORKER_BATCH_SIZE=20
SHEETS_WORKER_MAX_ATTEMPTS=8
SHEETS_WORKER_BASE_RETRY_MS=30000
SHEETS_WORKER_LOCK_TIMEOUT_MS=300000
EOF

chmod 600 "${environment_file}"
echo "Created protected staging environment configuration."
