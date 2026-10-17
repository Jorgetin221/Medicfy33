import { describe, expect, it } from "vitest";
import { ALL_NAV_HREFS, isNavLinkActive } from "./app-nav";

describe("isNavLinkActive", () => {
  it("activates '/pacientes' while registering a new patient (no separate nav link for it)", () => {
    expect(isNavLinkActive("/pacientes/nuevo", "/pacientes")).toBe(true);
  });

  it("activates '/pacientes' on the list and on a specific patient's record", () => {
    expect(isNavLinkActive("/pacientes", "/pacientes")).toBe(true);
    expect(isNavLinkActive("/pacientes/patient-123", "/pacientes")).toBe(true);
  });

  it("with nested links, activates only the most specific one", () => {
    const hrefs = ["/pacientes", "/pacientes/nuevo"];
    expect(isNavLinkActive("/pacientes/nuevo", "/pacientes/nuevo", hrefs)).toBe(true);
    expect(isNavLinkActive("/pacientes/nuevo", "/pacientes", hrefs)).toBe(false);
    expect(isNavLinkActive("/pacientes/patient-123", "/pacientes", hrefs)).toBe(true);
    expect(isNavLinkActive("/pacientes/patient-123", "/pacientes/nuevo", hrefs)).toBe(false);
  });

  it("activates other nav links correctly", () => {
    expect(isNavLinkActive("/agenda", "/agenda")).toBe(true);
    expect(isNavLinkActive("/agenda", "/pacientes")).toBe(false);
    expect(isNavLinkActive("/admin", "/admin")).toBe(true);
    expect(isNavLinkActive("/perfil", "/perfil")).toBe(true);
  });

  it("includes all expected routes in ALL_NAV_HREFS", () => {
    expect(ALL_NAV_HREFS).toContain("/pacientes");
    expect(ALL_NAV_HREFS).not.toContain("/pacientes/nuevo");
    expect(ALL_NAV_HREFS).toContain("/agenda");
    expect(ALL_NAV_HREFS).toContain("/admin");
    expect(ALL_NAV_HREFS).toContain("/perfil");
  });
});
