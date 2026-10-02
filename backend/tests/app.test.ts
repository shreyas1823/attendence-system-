import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createApp } from "../src/app/create-app.js";
import type { Environment } from "../src/config/env.js";
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
  DEVICE_ATTENDANCE_RATE_LIMIT: 120,
  DEVICE_HEARTBEAT_RATE_LIMIT: 30,
  DEVICE_RATE_LIMIT_WINDOW_MS: 60_000,
  REQUEST_BODY_LIMIT_BYTES: 16_384
};

describe("service probes and safe errors", () => {
  it("reports process and database readiness", async () => {
    const database = await createTestDatabase();
    const app = await createApp({
      environment,
      readinessCheck: async () => { await database.db.execute(sql`select 1`); }
    });
    try {
      const health = await app.inject({ method: "GET", url: "/health" });
      const ready = await app.inject({ method: "GET", url: "/ready" });
      expect(health.statusCode).toBe(200);
      expect(health.json()).toEqual({ status: "ok" });
      expect(ready.statusCode).toBe(200);
      expect(ready.json()).toEqual({ status: "ready" });
    } finally {
      await app.close();
      await database.close();
    }
  });

  it("returns 503 without database details when readiness fails", async () => {
    const app = await createApp({
      environment,
      readinessCheck: async () => { throw new Error("secret database host detail"); }
    });
    try {
      const response = await app.inject({ method: "GET", url: "/ready" });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ status: "not_ready" });
      expect(response.body).not.toContain("secret database host detail");
    } finally {
      await app.close();
    }
  });

  it("does not expose parser details or stacks", async () => {
    const app = await createApp({ environment, readinessCheck: async () => {} });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/students",
        headers: { "content-type": "application/json" },
        payload: "{bad-json"
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: { code: "bad_request", message: "Invalid request" }
      });
      expect(response.body.toLowerCase()).not.toContain("stack");
    } finally {
      await app.close();
    }
  });
});
