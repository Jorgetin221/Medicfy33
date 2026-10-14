import { describe, expect, it } from "vitest";
import { ALL_NAV_HREFS, isNavLinkActive } from "./app-nav";

describe("isNavLinkActive", () => {
  it("activates only '/pacientes/nuevo' when path is '/pacientes/nuevo'", () => {
    expect(isNavLinkActive("/pacientes/nuevo", "/pacientes/nuevo")).toBe(true);
    expect(isNavLinkActive("/pacientes/nuevo", "/pacientes")).toBe(false);
  });

  it("activates only '/pacientes' when path is '/pacientes'", () => {
    expect(isNavLinkActive("/pacientes", "/pacientes")).toBe(true);
    expect(isNavLinkActive("/pacientes", "/pacientes/nuevo")).toBe(false);
  });

  it("activates '/pacientes' when viewing a specific patient details page", () => {
    expect(isNavLinkActive("/pacientes/patient-123", "/pacientes")).toBe(true);
    expect(isNavLinkActive("/pacientes/patient-123", "/pacientes/nuevo")).toBe(false);
  });

  it("activates other nav links correctly", () => {
    expect(isNavLinkActive("/agenda", "/agenda")).toBe(true);
    expect(isNavLinkActive("/agenda", "/pacientes")).toBe(false);
    expect(isNavLinkActive("/admin", "/admin")).toBe(true);
    expect(isNavLinkActive("/perfil", "/perfil")).toBe(true);
  });

  it("includes all expected routes in ALL_NAV_HREFS", () => {
    expect(ALL_NAV_HREFS).toContain("/pacientes");
    expect(ALL_NAV_HREFS).toContain("/pacientes/nuevo");
    expect(ALL_NAV_HREFS).toContain("/agenda");
    expect(ALL_NAV_HREFS).toContain("/admin");
    expect(ALL_NAV_HREFS).toContain("/perfil");
  });
});
