import { describe, expect, it } from "vitest";
import { containsContactInfo } from "./biography";

describe("containsContactInfo", () => {
  it("flags a phone-like digit sequence", () => {
    expect(containsContactInfo("Llámame al 33 1234 5678 para más información.")).toBe(true);
  });

  it("flags an email address", () => {
    expect(containsContactInfo("Escríbeme a doctor@example.com")).toBe(true);
  });

  it("does not flag ordinary biography text", () => {
    expect(
      containsContactInfo(
        "Médico general con 10 años de experiencia en atención primaria, egresado de la UNAM."
      )
    ).toBe(false);
  });
});
