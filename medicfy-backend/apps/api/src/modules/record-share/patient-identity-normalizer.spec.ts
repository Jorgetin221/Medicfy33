import { describe, expect, it } from "vitest";
import { normalizeMxPhoneToE164, normalizePersonName } from "./patient-identity-normalizer.util";

describe("normalizePersonName", () => {
  it("lowercases, strips accents (incluida ñ) and collapses whitespace", () => {
    expect(normalizePersonName("  María José  Peña  ")).toBe("maria jose pena");
  });

  it("does not mangle names ending in -os/-as (a diferencia del normalizador de catálogo)", () => {
    expect(normalizePersonName("Carlos")).toBe("carlos");
    expect(normalizePersonName("Dolores")).toBe("dolores");
  });
});

// normalizeEmail ya existe en @medicfy/contracts (validators/email.ts)
// — se reutiliza tal cual, sin duplicarlo aquí.

describe("normalizeMxPhoneToE164", () => {
  it("accepts an already-E.164 number", () => {
    expect(normalizeMxPhoneToE164("+525512345678")).toBe("+525512345678");
  });

  it("accepts a bare 10-digit national number and prepends +52", () => {
    expect(normalizeMxPhoneToE164("5512345678")).toBe("+525512345678");
  });

  it("accepts a country code without the plus sign", () => {
    expect(normalizeMxPhoneToE164("525512345678")).toBe("+525512345678");
  });

  it("strips spaces and dashes before normalizing", () => {
    expect(normalizeMxPhoneToE164("55 1234-5678")).toBe("+525512345678");
  });

  it("returns null for an unnormalizable number instead of guessing", () => {
    expect(normalizeMxPhoneToE164("123")).toBeNull();
    expect(normalizeMxPhoneToE164("55123456789")).toBeNull();
  });
});
