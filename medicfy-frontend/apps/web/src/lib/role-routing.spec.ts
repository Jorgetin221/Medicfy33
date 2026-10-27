import { describe, expect, it } from "vitest";
import { homeRouteForRole, isAppRouteAllowed, safeInternalRedirect } from "./role-routing";

// Auditoría 2026-10-21: M-31 y M-22.
describe("role routing", () => {
  it("each role lands on its own home", () => {
    expect(homeRouteForRole("PATIENT")).toBe("/mi-cuenta");
    expect(homeRouteForRole("ADMIN")).toBe("/admin");
    expect(homeRouteForRole("DOCTOR")).toBe("/agenda");
  });

  it("keeps patients and admins out of the practice screens, and doctors out of /admin", () => {
    expect(isAppRouteAllowed("PATIENT", "/agenda")).toBe(false);
    expect(isAppRouteAllowed("ADMIN", "/agenda")).toBe(false);
    expect(isAppRouteAllowed("ADMIN", "/admin/usuarios")).toBe(true);
    expect(isAppRouteAllowed("DOCTOR", "/admin")).toBe(false);
    expect(isAppRouteAllowed("DOCTOR", "/pacientes/1")).toBe(true);
    expect(isAppRouteAllowed("CURATOR", "/admin")).toBe(true);
  });

  it("only accepts internal redirects", () => {
    expect(safeInternalRedirect("/dr/ana")).toBe("/dr/ana");
    expect(safeInternalRedirect("//evil.com")).toBeNull();
    expect(safeInternalRedirect("/\\evil.com")).toBeNull();
    expect(safeInternalRedirect("https://evil.com")).toBeNull();
  });
});
