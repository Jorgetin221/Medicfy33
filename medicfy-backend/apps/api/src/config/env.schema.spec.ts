import { describe, expect, it } from "vitest";
import { validateEnv } from "./env.schema";

const BASE = {
  APP_DATABASE_URL: "postgresql://medicfy_app@localhost:5432/x",
  JWT_ACCESS_SECRET: "x".repeat(64),
  MFA_SECRET_ENCRYPTION_KEY: "k",
  APP_BASE_URL: "http://localhost:3001",
};

// Auditoría 2026-10-21, A-16 y A-18.
describe("validateEnv", () => {
  it("trusts exactly one proxy hop in production by default (nginx)", () => {
    expect(validateEnv({ ...BASE, NODE_ENV: "production" }).TRUST_PROXY_HOPS).toBe(1);
  });

  it("trusts no proxy outside production by default", () => {
    expect(validateEnv({ ...BASE, NODE_ENV: "development" }).TRUST_PROXY_HOPS).toBe(0);
  });

  it("honours an explicit TRUST_PROXY_HOPS", () => {
    expect(validateEnv({ ...BASE, NODE_ENV: "production", TRUST_PROXY_HOPS: "2" }).TRUST_PROXY_HOPS).toBe(2);
  });

  it("keeps API docs off unless explicitly enabled", () => {
    expect(validateEnv({ ...BASE }).ENABLE_API_DOCS).toBe(false);
    expect(validateEnv({ ...BASE, ENABLE_API_DOCS: "true" }).ENABLE_API_DOCS).toBe(true);
  });
});
