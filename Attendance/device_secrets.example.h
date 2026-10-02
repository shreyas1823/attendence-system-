#pragma once

// Copy this file to device_secrets.h and replace every placeholder locally.
// Attendance/device_secrets.h is ignored by Git and must never be committed.

const char* DEVICE_API_URL = "https://REPLACE_WITH_STAGING_BACKEND/api/v1/device/attendance";
const char* DEVICE_IDENTIFIER = "REPLACE_WITH_STAGING_DEVICE_IDENTIFIER";
const char* DEVICE_CREDENTIAL = "REPLACE_WITH_STAGING_DEVICE_CREDENTIAL";

// PEM root CA that validates the staging backend certificate chain.
// Never replace this with setInsecure() for Device API communication.
const char DEVICE_API_ROOT_CA[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
REPLACE_WITH_STAGING_BACKEND_ROOT_CA_PEM
-----END CERTIFICATE-----
)EOF";
