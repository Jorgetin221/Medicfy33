import { describe, expect, it } from "vitest";
import { isValidBirthDate } from "./birthDate";

describe("isValidBirthDate", () => {
  const now = new Date("2026-08-13T00:00:00Z");

  it("accepts a plausible adult birth date", () => {
    expect(isValidBirthDate(new Date("1990-05-20T00:00:00Z"), now)).toBe(true);
  });

  it("rejects a birth date in the future", () => {
    expect(isValidBirthDate(new Date("2027-01-01T00:00:00Z"), now)).toBe(false);
  });

  it("rejects a birth date more than 120 years ago", () => {
    expect(isValidBirthDate(new Date("1900-01-01T00:00:00Z"), now)).toBe(false);
  });

  it("accepts exactly 120 years ago", () => {
    expect(isValidBirthDate(new Date("1906-08-13T00:00:00Z"), now)).toBe(true);
  });

  it("accepts today", () => {
    expect(isValidBirthDate(now, now)).toBe(true);
  });
});
