$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$firmwarePath = Join-Path $repoRoot 'Attendance\Attendance.ino'
$appsScriptPath = Join-Path $repoRoot 'integrations\google-apps-script\Code.gs'
$manifestPath = Join-Path $repoRoot 'integrations\google-apps-script\appsscript.json'
$gitignorePath = Join-Path $repoRoot '.gitignore'
$deviceSecretsExamplePath = Join-Path $repoRoot 'Attendance\device_secrets.example.h'
$failures = [System.Collections.Generic.List[string]]::new()

foreach ($requiredPath in @($firmwarePath, $appsScriptPath, $gitignorePath)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    $failures.Add("Missing required path: $requiredPath")
  }
}

if (Test-Path -LiteralPath $firmwarePath) {
  $firmware = Get-Content -Raw -LiteralPath $firmwarePath
  foreach ($pattern in @('#define BUZZER_PIN D0', 'SoftwareSerial mySerial(D5, D6)', 'LiquidCrystal_I2C lcd(0x27, 16, 2)', 'D2,', 'D1', '57600', '115200')) {
    if (-not $firmware.Contains($pattern)) {
      $failures.Add("Locked firmware contract pattern is missing: $pattern")
    }
  }

  if ($firmware -match '(?s)const\s+char\*\s+(WIFI_SSID|WIFI_PASSWORD|SCRIPT_URL|SECRET_KEY|DEVICE_API_URL|DEVICE_IDENTIFIER|DEVICE_CREDENTIAL)\s*=\s*"(?!REPLACE_)') {
    $failures.Add('A credential-like firmware constant appears to contain a non-placeholder value.')
  }
}

if (Test-Path -LiteralPath $appsScriptPath) {
  $appsScript = Get-Content -Raw -LiteralPath $appsScriptPath
  if ($appsScript -match '(?s)const\s+(SPREADSHEET_ID|SECRET_KEY)\s*=\s*"[^\"]+"') {
    $failures.Add('Apps Script contains a hard-coded spreadsheet identifier or shared key.')
  }

  foreach ($propertyName in @('SPREADSHEET_ID', 'SECRET_KEY')) {
    if (-not $appsScript.Contains("getProperty(`"$propertyName`")")) {
      $failures.Add("Apps Script does not load $propertyName from Script Properties.")
    }
  }
}

$gitignore = if (Test-Path -LiteralPath $gitignorePath) { Get-Content -Raw -LiteralPath $gitignorePath } else { '' }
if (-not $gitignore.Contains('Attendance/secrets.h')) {
  $failures.Add('Attendance/secrets.h is not ignored by Git.')
}
if (-not $gitignore.Contains('Attendance/device_secrets.h')) {
  $failures.Add('Attendance/device_secrets.h is not ignored by Git.')
}

if (-not (Test-Path -LiteralPath $deviceSecretsExamplePath)) {
  $failures.Add('Missing Device API secrets placeholder file.')
} else {
  $deviceSecretsExample = Get-Content -Raw -LiteralPath $deviceSecretsExamplePath
  foreach ($placeholder in @('REPLACE_WITH_STAGING_BACKEND', 'REPLACE_WITH_STAGING_DEVICE_IDENTIFIER', 'REPLACE_WITH_STAGING_DEVICE_CREDENTIAL', 'REPLACE_WITH_STAGING_BACKEND_ROOT_CA_PEM')) {
    if (-not $deviceSecretsExample.Contains($placeholder)) {
      $failures.Add("Missing Device API placeholder: $placeholder")
    }
  }
}

if (-not (Test-Path -LiteralPath $manifestPath)) {
  $failures.Add('Missing deployed Apps Script manifest: integrations/google-apps-script/appsscript.json')
} else {
  try {
    $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json -ErrorAction Stop
    if ($manifest.timeZone -ne 'Asia/Kolkata') {
      $failures.Add('Apps Script manifest timezone does not match the current contract.')
    }
    if ($manifest.runtimeVersion -ne 'V8') {
      $failures.Add('Apps Script manifest runtime is not V8.')
    }
    if ($manifest.exceptionLogging -ne 'STACKDRIVER') {
      $failures.Add('Apps Script manifest exception logging is not STACKDRIVER.')
    }
    if ($manifest.webapp.executeAs -ne 'USER_DEPLOYING') {
      $failures.Add('Apps Script web app executeAs differs from the deployed baseline.')
    }
    if ($manifest.webapp.access -ne 'ANYONE_ANONYMOUS') {
      $failures.Add('Apps Script web app access differs from the deployed baseline.')
    }
  } catch {
    $failures.Add('Apps Script manifest is not valid JSON.')
  }
}

if ($failures.Count -gt 0) {
  foreach ($failure in $failures) { Write-Error $failure }
  exit 1
}

Write-Output 'Repository structure, secret-boundary, and locked hardware checks passed.'
