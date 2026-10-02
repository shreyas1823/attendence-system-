import { count, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { Writable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app/create-app.js";
import type { Environment } from "../src/config/env.js";
import {
  attendanceRecords,
  deviceCredentials,
  deviceEventReceipts,
  devices,
  fingerprintEnrollments,
  outboxJobs,
  students
} from "../src/db/schema.js";
import { DeviceProvisioningService } from "../src/modules/devices/device-provisioning-service.js";
import { argon2idPasswordHasher } from "../src/security/password-hasher.js";
import { createTestDatabase } from "./helpers/database.js";

const environment: Environment = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 3000,
  DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  SESSION_SECRET: "test-only-session-secret-at-least-32-characters",
  CORS_ORIGINS: "https://staging.invalid",
  LOG_LEVEL: "silent",
  TIME_ZONE: "Asia/Kolkata",
  DEVICE_ATTENDANCE_RATE_LIMIT: 100,
  DEVICE_HEARTBEAT_RATE_LIMIT: 100,
  DEVICE_RATE_LIMIT_WINDOW_MS: 60_000,
  REQUEST_BODY_LIMIT_BYTES: 1_024
};

describe("authenticated device API", () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: FastifyInstance;
  let deviceIdentifier: string;
  let credential: string;
  let deviceId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    const provisioning = new DeviceProvisioningService(database.db, argon2idPasswordHasher);
    const provisioned = await provisioning.provision({
      deviceIdentifier: "TEST-DEVICE-API",
      name: "Synthetic API Device"
    });
    deviceIdentifier = provisioned.deviceIdentifier;
    credential = provisioned.credential;
    deviceId = provisioned.deviceId;

    const [oneFinger] = await database.db.insert(students).values({
      studentId: "API001",
      name: "Synthetic One Finger",
      mobileNumber: "+919000000201"
    }).returning();
    const [twoFinger] = await database.db.insert(students).values({
      studentId: "API002",
      name: "Synthetic Two Finger",
      mobileNumber: "+919000000202"
    }).returning();
    await database.db.insert(fingerprintEnrollments).values([
      { studentId: oneFinger!.id, fingerprintId: 61, slotNumber: 1 },
      { studentId: twoFinger!.id, fingerprintId: 62, slotNumber: 1 },
      { studentId: twoFinger!.id, fingerprintId: 63, slotNumber: 2 }
    ]);

    app = await createApp({
      environment,
      database: database.db,
      readinessCheck: async () => {}
    });
  });

  afterAll(async () => {
    await app.close();
    await database.close();
  });

  function headers(secret = credential, identifier = deviceIdentifier) {
    return {
      "content-type": "application/json",
      "x-device-id": identifier,
      authorization: `Bearer ${secret}`
    };
  }

  function event(eventId: string, fingerprintId: number, occurredAt: string) {
    return { eventId, fingerprintId, occurredAt, eventType: "ATTENDANCE" };
  }

  it("publishes an OpenAPI contract generated from the runtime schemas", async () => {
    const response = await app.inject({ method: "GET", url: "/openapi.json" });
    expect(response.statusCode).toBe(200);
    const specification = response.json();
    expect(specification.openapi).toBe("3.1.0");
    expect(specification.paths["/api/v1/device/attendance"].post).toBeDefined();
    expect(specification.paths["/api/v1/device/heartbeat"].post).toBeDefined();
  });

  it("authenticates a valid heartbeat and updates last_seen_at", async () => {
    const before = await database.db.query.devices.findFirst({ where: eq(devices.id, deviceId) });
    expect(before!.lastSeenAt).toBeNull();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/device/heartbeat",
      headers: headers(),
      payload: { eventType: "HEARTBEAT" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok" });
    const after = await database.db.query.devices.findFirst({ where: eq(devices.id, deviceId) });
    expect(after!.lastSeenAt).toBeInstanceOf(Date);
  });

  it.each([
    ["invalid credential", () => headers("this-is-a-wrong-credential-value")],
    ["unknown device", () => headers(credential, "UNKNOWN-DEVICE")],
    ["missing credential", () => ({ "content-type": "application/json", "x-device-id": deviceIdentifier })]
  ])("returns the same safe authentication response for %s", async (_label, makeHeaders) => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/device/heartbeat",
      headers: makeHeaders(),
      payload: { eventType: "HEARTBEAT" }
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "authentication_failed", message: "Device authentication failed" }
    });
    expect(response.body).not.toContain(credential);
  });

  it("rejects revoked credentials and disabled devices without existence leaks", async () => {
    const provisioning = new DeviceProvisioningService(database.db, argon2idPasswordHasher);
    const revoked = await provisioning.provision({ deviceIdentifier: "REVOKED-CREDENTIAL", name: "Revoked" });
    await provisioning.revoke(revoked.credentialId);
    const revokedResponse = await app.inject({
      method: "POST", url: "/api/v1/device/heartbeat",
      headers: headers(revoked.credential, revoked.deviceIdentifier), payload: { eventType: "HEARTBEAT" }
    });

    const disabled = await provisioning.provision({ deviceIdentifier: "DISABLED-DEVICE", name: "Disabled" });
    await database.db.update(devices).set({ status: "INACTIVE" }).where(eq(devices.id, disabled.deviceId));
    const disabledResponse = await app.inject({
      method: "POST", url: "/api/v1/device/heartbeat",
      headers: headers(disabled.credential, disabled.deviceIdentifier), payload: { eventType: "HEARTBEAT" }
    });
    expect(revokedResponse.statusCode).toBe(401);
    expect(disabledResponse.statusCode).toBe(401);
    expect(revokedResponse.json().error.code).toBe("authentication_failed");
    expect(disabledResponse.json().error.code).toBe("authentication_failed");
  });

  it("rotates credentials and invalidates the previous value", async () => {
    const provisioning = new DeviceProvisioningService(database.db, argon2idPasswordHasher);
    const rotating = await provisioning.provision({ deviceIdentifier: "ROTATING-DEVICE", name: "Rotating" });
    const replacement = await provisioning.rotate(rotating.deviceId);
    const oldResponse = await app.inject({
      method: "POST", url: "/api/v1/device/heartbeat",
      headers: headers(rotating.credential, rotating.deviceIdentifier), payload: { eventType: "HEARTBEAT" }
    });
    const newResponse = await app.inject({
      method: "POST", url: "/api/v1/device/heartbeat",
      headers: headers(replacement.credential, rotating.deviceIdentifier), payload: { eventType: "HEARTBEAT" }
    });
    expect(oldResponse.statusCode).toBe(401);
    expect(newResponse.statusCode).toBe(200);
  });

  it("records first and second attendance through either fingerprint and rejects the third", async () => {
    const first = await app.inject({
      method: "POST", url: "/api/v1/device/attendance", headers: headers(),
      payload: event("api-two-1", 62, "2026-09-21T09:05:00+05:30")
    });
    const second = await app.inject({
      method: "POST", url: "/api/v1/device/attendance", headers: headers(),
      payload: event("api-two-2", 63, "2026-09-21T14:03:00+05:30")
    });
    const third = await app.inject({
      method: "POST", url: "/api/v1/device/attendance", headers: headers(),
      payload: event("api-two-3", 62, "2026-09-21T15:00:00+05:30")
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().status).toBe("recorded_first_scan");
    expect(second.statusCode).toBe(201);
    expect(second.json().status).toBe("recorded_second_scan");
    expect(third.statusCode).toBe(409);
    expect(third.json()).toMatchObject({ status: "daily_limit_reached", duplicate: false });
    const records = await database.db.select().from(attendanceRecords)
      .where(eq(attendanceRecords.attendanceDate, "2026-09-21"));
    expect(records).toHaveLength(2);
    expect(new Set(records.map((record) => record.studentId)).size).toBe(1);
  });

  it("supports a one-fingerprint student and derives the college-local date", async () => {
    const response = await app.inject({
      method: "POST", url: "/api/v1/device/attendance", headers: headers(),
      payload: event("api-one-1", 61, "2026-09-20T20:00:00Z")
    });
    expect(response.statusCode).toBe(201);
    const stored = await database.db.query.attendanceRecords.findFirst({
      where: eq(attendanceRecords.eventId, "api-one-1")
    });
    expect(stored!.attendanceDate).toBe("2026-09-21");
  });

  it("returns a safe unknown-fingerprint error without writing partial state", async () => {
    const response = await app.inject({
      method: "POST", url: "/api/v1/device/attendance", headers: headers(),
      payload: event("api-unknown", 99, "2026-09-22T09:00:00+05:30")
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: "unknown_fingerprint", message: "Fingerprint is unknown or inactive" }
    });
    expect(await database.db.query.deviceEventReceipts.findFirst({
      where: eq(deviceEventReceipts.eventId, "api-unknown")
    })).toBeUndefined();
  });

  it("replays duplicate events deterministically without duplicate attendance or outbox", async () => {
    const payload = event("api-retry", 61, "2026-09-23T09:00:00+05:30");
    const first = await app.inject({ method: "POST", url: "/api/v1/device/attendance", headers: headers(), payload });
    const retry = await app.inject({ method: "POST", url: "/api/v1/device/attendance", headers: headers(), payload });
    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toMatchObject({ status: "attendance_event_replayed", duplicate: true });
    const [attendanceCount] = await database.db.select({ value: count() }).from(attendanceRecords)
      .where(eq(attendanceRecords.eventId, "api-retry"));
    const [totalAttendance] = await database.db.select({ value: count() }).from(attendanceRecords);
    const [outboxCount] = await database.db.select({ value: count() }).from(outboxJobs)
      .where(eq(outboxJobs.eventType, "attendance.recorded"));
    expect(attendanceCount!.value).toBe(1);
    expect(outboxCount!.value).toBe(totalAttendance!.value);
  });

  it("handles concurrent duplicate submissions without duplicate persistence", async () => {
    const payload = event("api-concurrent", 61, "2026-09-24T09:00:00+05:30");
    const responses = await Promise.all([
      app.inject({ method: "POST", url: "/api/v1/device/attendance", headers: headers(), payload }),
      app.inject({ method: "POST", url: "/api/v1/device/attendance", headers: headers(), payload })
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 201]);
    const persisted = await database.db.select().from(attendanceRecords)
      .where(eq(attendanceRecords.eventId, "api-concurrent"));
    expect(persisted).toHaveLength(1);
  });

  it("validates malformed, missing, invalid-type, and oversized requests safely", async () => {
    const malformed = await app.inject({
      method: "POST", url: "/api/v1/device/heartbeat", headers: headers(), payload: "{bad"
    });
    const missing = await app.inject({
      method: "POST", url: "/api/v1/device/attendance", headers: headers(), payload: { eventType: "ATTENDANCE" }
    });
    const invalid = await app.inject({
      method: "POST", url: "/api/v1/device/attendance", headers: headers(),
      payload: event("bad-type", "not-a-number" as unknown as number, "2026-09-25T09:00:00+05:30")
    });
    const oversized = await app.inject({
      method: "POST", url: "/api/v1/device/attendance", headers: headers(),
      payload: { ...event("oversized", 61, "2026-09-25T09:00:00+05:30"), padding: "x".repeat(2_000) }
    });
    expect(malformed.statusCode).toBe(400);
    expect(missing.statusCode).toBe(400);
    expect(invalid.statusCode).toBe(400);
    expect(oversized.statusCode).toBe(413);
    for (const response of [malformed, missing, invalid, oversized]) {
      expect(response.body).not.toContain(credential);
      expect(response.body.toLowerCase()).not.toContain("stack");
    }
  });

  it("rate limits device endpoints", async () => {
    const limitedApp = await createApp({
      environment: { ...environment, DEVICE_HEARTBEAT_RATE_LIMIT: 2 },
      database: database.db,
      readinessCheck: async () => {}
    });
    try {
      const request = () => limitedApp.inject({
        method: "POST", url: "/api/v1/device/heartbeat", headers: headers(), payload: { eventType: "HEARTBEAT" }
      });
      expect((await request()).statusCode).toBe(200);
      expect((await request()).statusCode).toBe(200);
      const limited = await request();
      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toMatchObject({ error: { code: "rate_limit_exceeded" } });
    } finally {
      await limitedApp.close();
    }
  });

  it("stores only credential hashes", async () => {
    const stored = await database.db.select().from(deviceCredentials)
      .where(eq(deviceCredentials.deviceId, deviceId));
    expect(stored).toHaveLength(1);
    expect(stored[0]!.credentialHash).toMatch(/^\$argon2id\$/);
    expect(stored[0]!.credentialHash).not.toContain(credential);
  });

  it("redacts device credentials and identifiers from structured logs", async () => {
    let output = "";
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      }
    });
    const loggingApp = await createApp({
      environment: { ...environment, LOG_LEVEL: "info" },
      readinessCheck: async () => {},
      logStream: stream
    });
    const syntheticSecret = "synthetic-credential-that-must-be-redacted";
    loggingApp.log.info({
      req: { headers: { authorization: `Bearer ${syntheticSecret}`, "x-device-id": "SENSITIVE-DEVICE-ID" } }
    }, "redaction test");
    await loggingApp.close();
    expect(output).not.toContain(syntheticSecret);
    expect(output).not.toContain("SENSITIVE-DEVICE-ID");
    expect(output).toContain("redaction test");
  });
});
