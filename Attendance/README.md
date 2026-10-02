# Attendance ESP8266 firmware

This directory contains the current NodeMCU ESP-12E attendance firmware. Phase 0 preserves its runtime logic and locked soldered hardware mapping while removing credentials from the tracked sketch.

## Locked hardware configuration

| Component | Configuration |
| --- | --- |
| Fingerprint sensor | ESP D5 RX, D6 TX using `SoftwareSerial`; 57600 baud |
| LCD | 16x2 I2C at `0x27`; D2 SDA and D1 SCL |
| Buzzer | D0 |
| Board | NodeMCU 1.0 ESP-12E |
| ESP8266 board package | 3.1.2 baseline |
| Serial monitor | 115200 baud |

Do not change these assignments without an explicit hardware decision.

## Local secrets

1. Copy `secrets.example.h` to `secrets.h`.
2. Replace every placeholder in `secrets.h` with the authorized local value.
3. Never commit or share `secrets.h`.

For the Phase 6 staging migration, also copy `device_secrets.example.h` to
ignored `device_secrets.h` and configure only the staging Device API URL,
device identifier, opaque credential, and validating root CA. Attendance uses
the Device API; registration temporarily retains the staging Apps Script path.
Never use `setInsecure()` for the Device API transport.
4. Do not upload firmware while the example placeholders are active.

The tracked example intentionally contains no working credentials. The current production Wi-Fi password and Apps Script shared key must be rotated because they previously existed in source.

## Required libraries

- ESP8266 Arduino core 3.1.2
- Adafruit Fingerprint Sensor Library 2.1.4
- LiquidCrystal_I2C 2.0.0
- ESP8266 core libraries: ESP8266WiFi, WiFiClientSecure, ESP8266HTTPClient, LittleFS, Wire, and SoftwareSerial

Exact third-party library versions still need to be captured from the machine that last compiled the known-good firmware.

## Commands

- `R`: register a student
- `A`: display attendance-mode confirmation; scanning is already active by default
- `C`, then exact `YES`: clear sensor templates and the local student database
- `H`: display help

## Local data

Students are stored in LittleFS at `/students.txt`, one record per line. The
first field contains one fingerprint ID or two comma-separated IDs:

```text
fingerprintID[,fingerprintID2]|studentId|studentName|parentWhatsApp
```

Legacy one-fingerprint records remain compatible. The current limit is 30 students.

## Build check

Phase 1 compiles locally with the Arduino IDE bundled CLI 1.5.1, ESP8266 core 3.1.2, and FQBN `esp8266:esp8266:nodemcuv2`. The check uses placeholder configuration and does not upload firmware.

## Phase 6 staging communication

- Attendance: HTTPS JSON to `POST /api/v1/device/attendance` with
  `x-device-id` and a bearer credential.
- Registration: existing staging Apps Script registration operation until a
  backend registration contract is separately approved.
- TLS: the Device API uses the CA in `device_secrets.h`; insecure mode is
  prohibited for this path. The legacy Apps Script path retains its explicit
  staging compatibility flag during rollback coexistence.
- Retry: network errors, HTTP 408/425/429, 5xx, and malformed success bodies
  remain in the persistent LittleFS queue. HTTP 200 replay, HTTP 201 accepted,
  and HTTP 409 daily-limit results complete the event. Authentication,
  validation, and unknown-fingerprint failures are archived to dead-letter
  storage rather than retried forever.
- Stable IDs: the complete serialized outbox record, including `eventId`, is
  preserved across reboot and retries.

Placeholder Phase 6 builds prove compilation only and must never be uploaded.
An upload candidate requires ignored staging Device API configuration and a
hardware-tested CA chain.

The latest build reports 38,332 bytes data RAM (47%), 63,963 bytes instruction RAM (97%), and 414,452 bytes flash (39%). The high instruction-RAM utilization should be watched during future firmware changes.
