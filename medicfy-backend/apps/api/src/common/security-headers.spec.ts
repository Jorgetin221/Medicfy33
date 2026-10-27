import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { securityHeaders } from "./security-headers";

function run(path: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const res = { setHeader: (k: string, v: string) => (headers[k] = v) } as unknown as Response;
  const next = vi.fn() as NextFunction;
  securityHeaders({ path } as Request, res, next);
  expect(next).toHaveBeenCalledOnce();
  return headers;
}

// Auditoría 2026-10-21, A-19.
describe("securityHeaders", () => {
  it("sets HSTS, nosniff, frame denial and a locked-down CSP on API responses", () => {
    const h = run("/records/patients/x/allergies");
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Content-Security-Policy"]).toContain("default-src 'none'");
    expect(h["Content-Security-Policy"]).toContain("sandbox");
  });

  it("relaxes the CSP only for the Swagger UI", () => {
    expect(run("/api/docs")["Content-Security-Policy"]).toContain("script-src 'self'");
  });
});
