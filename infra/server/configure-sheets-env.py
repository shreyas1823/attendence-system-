#!/usr/bin/env python3
import json
import os
import pathlib
import sys
import tempfile
from urllib.parse import urlparse

deployment_root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/opt/ai-attendance")
environment_path = deployment_root / "infra" / ".env.staging"
configuration = json.load(sys.stdin)
endpoint = configuration.get("url", "")
secret = configuration.get("secret", "")
parsed = urlparse(endpoint)

if parsed.scheme != "https" or parsed.hostname != "script.google.com":
    raise SystemExit("Refusing a non-Google or non-HTTPS Sheets adapter endpoint")
if not parsed.path.startswith("/macros/s/") or not parsed.path.endswith("/exec"):
    raise SystemExit("Refusing an unexpected Apps Script deployment path")
if len(secret) < 20:
    raise SystemExit("Refusing an invalid Sheets adapter secret")

updates = {
    "SHEETS_ADAPTER_URL": endpoint,
    "SHEETS_ADAPTER_SECRET": secret,
}
lines = environment_path.read_text(encoding="utf-8").splitlines()
found = set()
output = []
for line in lines:
    key = line.split("=", 1)[0]
    if key in updates:
        output.append(f"{key}={updates[key]}")
        found.add(key)
    else:
        output.append(line)
if found != set(updates):
    raise SystemExit("Staging environment lacks expected Sheets adapter keys")

descriptor, temporary_name = tempfile.mkstemp(dir=environment_path.parent, prefix=".env.staging.")
try:
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        handle.write("\n".join(output) + "\n")
    os.chmod(temporary_name, 0o600)
    os.replace(temporary_name, environment_path)
finally:
    if os.path.exists(temporary_name):
        os.unlink(temporary_name)

print("Configured protected staging Sheets adapter values.")
