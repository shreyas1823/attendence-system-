$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$firmwarePath = Join-Path $repoRoot 'Attendance\Attendance.ino'
$configPath = Join-Path $repoRoot 'Attendance\config.h'
$firmware = Get-Content -Raw -LiteralPath $firmwarePath
$config = Get-Content -Raw -LiteralPath $configPath
$failures = [System.Collections.Generic.List[string]]::new()

$requiredFirmwarePatterns = @(
  '#define BUZZER_PIN D0',
  'SoftwareSerial mySerial(D5, D6)',
  'LiquidCrystal_I2C lcd(0x27, 16, 2)',
  'Wire.begin(',
  'D2,',
  'D1',
  'mySerial.begin(',
  '57600',
  'Serial.begin(',
  '115200',
  '#define DB_FILE "/students.txt"',
  '#define OUTBOX_FILE "/attendance_outbox_v1.txt"',
  'findStudentIndexByStudentId',
  'finger.deleteModel',
  'HTTP_RESPONSE_TIMEOUT_MS',
  'maintainWiFi',
  'maintainTime',
  'processOutbox',
  'waitingForFingerRemoval',
  'parentWhatsApp=',
  'Parent WhatsApp (10 digits):',
  'isTenDigitPhoneInput(parentPhone)',
  'Fingerprint count (1 or 2):',
  'fingerprintID2',
  'Use a DIFFERENT finger for the second fingerprint.',
  'makeStudentEvent(',
  'fingerprintID',
  'file.print("v2|")',
  'fields[0] == "v1"',
  'recorded_second_scan',
  'attendance_event_replayed',
  'daily_limit_reached',
  '"register"',
  '"attendance"'
  'sendDeviceApiEvent(event)'
  'String(DEVICE_API_URL)'
  '"x-device-id"'
  '"Authorization"'
  '"Bearer " + String(DEVICE_CREDENTIAL)'
  'client.setTrustAnchors('
  'DEVICE_API_ROOT_CA'
  'classifyDeviceApiResponse'
  'ATTENDANCE'
  'archiveDeadLetter(event)'
)

foreach ($pattern in $requiredFirmwarePatterns) {
  if (-not $firmware.Contains($pattern)) {
    $failures.Add("Missing required firmware pattern: $pattern")
  }
}

foreach ($forbiddenPattern in @(
  'LittleFS.format(',
  'Serial.println(student.parentWhatsApp)',
  'Serial.println(response)',
  'String(SCRIPT_URL) + "?key="',
  'Parent WhatsApp (10 digits or +91):'
)) {
  if ($firmware.Contains($forbiddenPattern)) {
    $failures.Add("Forbidden firmware pattern remains: $forbiddenPattern")
  }
}

if (-not $config.Contains('#define LEGACY_ALLOW_INSECURE_TLS 1')) {
  $failures.Add('Temporary legacy TLS compatibility flag is not explicit.')
}

if (-not $config.Contains('#define DEVICE_API_REQUIRE_VERIFIED_TLS 1')) {
  $failures.Add('Device API verified TLS requirement is not explicit.')
}

$deviceApiStart = $firmware.IndexOf('GoogleResult sendDeviceApiEvent(')
$deviceApiEnd = $firmware.IndexOf('bool writeOutboxEvent(', $deviceApiStart)
if ($deviceApiStart -lt 0 -or $deviceApiEnd -lt 0) {
  $failures.Add('Unable to locate the Device API transport implementation.')
} else {
  $deviceApiTransport = $firmware.Substring($deviceApiStart, $deviceApiEnd - $deviceApiStart)
  if ($deviceApiTransport.Contains('setInsecure')) {
    $failures.Add('Device API transport must not disable TLS verification.')
  }
}

$braceBalance = 0
$inString = $false
$inChar = $false
$escaped = $false
$inLineComment = $false
$inBlockComment = $false

for ($i = 0; $i -lt $firmware.Length; $i++) {
  $character = $firmware[$i]
  $next = if ($i + 1 -lt $firmware.Length) { $firmware[$i + 1] } else { [char]0 }

  if ($inLineComment) {
    if ($character -eq "`n") { $inLineComment = $false }
    continue
  }

  if ($inBlockComment) {
    if ($character -eq '*' -and $next -eq '/') {
      $inBlockComment = $false
      $i++
    }
    continue
  }

  if (-not $inString -and -not $inChar -and $character -eq '/' -and $next -eq '/') {
    $inLineComment = $true
    $i++
    continue
  }

  if (-not $inString -and -not $inChar -and $character -eq '/' -and $next -eq '*') {
    $inBlockComment = $true
    $i++
    continue
  }

  if (-not $inChar -and $character -eq '"' -and -not $escaped) {
    $inString = -not $inString
  }

  if (-not $inString -and $character -eq "'" -and -not $escaped) {
    $inChar = -not $inChar
  }

  if (-not $inString -and -not $inChar) {
    if ($character -eq '{') { $braceBalance++ }
    if ($character -eq '}') { $braceBalance-- }
    if ($braceBalance -lt 0) {
      $failures.Add('Firmware has an unmatched closing brace.')
      break
    }
  }

  if ($character -eq '\' -and -not $escaped) {
    $escaped = $true
  } else {
    $escaped = $false
  }
}

if ($braceBalance -ne 0) {
  $failures.Add("Firmware brace balance is $braceBalance instead of zero.")
}

if ($failures.Count -gt 0) {
  foreach ($failure in $failures) { Write-Error $failure }
  exit 1
}

Write-Output 'Firmware static contract checks passed.'
Write-Output 'NOT TESTED - Arduino toolchain unavailable; this is not a compile result.'
