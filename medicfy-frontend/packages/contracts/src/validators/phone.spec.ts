import { describe, expect, it } from "vitest";
import { isValidMxPhoneE164 } from "./phone";

describe("isValidMxPhoneE164", () => {
  it("accepts a well-formed MX E.164 number", () => {
    expect(isValidMxPhoneE164("+523312345678")).toBe(true);
  });

  it("rejects a non-+52 prefix", () => {
    expect(isValidMxPhoneE164("+13312345678")).toBe(false);
  });

  it("rejects fewer or more than 10 national digits", () => {
    expect(isValidMxPhoneE164("+52331234567")).toBe(false);
    expect(isValidMxPhoneE164("+5233123456789")).toBe(false);
  });

  it("rejects a number missing the + prefix", () => {
    expect(isValidMxPhoneE164("523312345678")).toBe(false);
  });
});
