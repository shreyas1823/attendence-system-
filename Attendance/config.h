#pragma once

// Public, non-secret firmware configuration.
// The soldered hardware mapping remains in Attendance.ino and must not change.

#define ATTENDANCE_FIRMWARE_VERSION "phase6-staging-api.0"
#define ATTENDANCE_TIMEZONE "Asia/Kolkata"

#define WIFI_CONNECT_TIMEOUT_MS 15000UL
#define WIFI_RECONNECT_INTERVAL_MS 30000UL
#define HTTP_CONNECT_TIMEOUT_MS 10000UL
#define HTTP_RESPONSE_TIMEOUT_MS 12000UL
#define NTP_SYNC_TIMEOUT_MS 12000UL
#define NTP_RETRY_INTERVAL_MS 60000UL
#define OUTBOX_RETRY_INTERVAL_MS 15000UL
#define OUTBOX_MAX_RECORDS 40
#define OUTBOX_MAX_ATTEMPTS 20

// TLS certificate validation requires a hardware-tested trust anchor for the
// deployed Apps Script redirect chain. Keep the legacy mode explicit until
// that trust anchor has passed a real-device test; never enable it silently.
#define LEGACY_ALLOW_INSECURE_TLS 1

// The new Device API path must always validate the configured staging CA.
#define DEVICE_API_REQUIRE_VERIFIED_TLS 1
