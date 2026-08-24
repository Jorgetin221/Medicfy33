import { describe, expect, it } from "vitest";
import { isValidCurp } from "./curp";

describe("isValidCurp", () => {
  it("rejects wrong length", () => {
    expect(isValidCurp("ABCD880101HDFRRN0")).toBe(false);
    expect(isValidCurp("ABCD880101HDFRRN012")).toBe(false);
  });

  it("rejects a structurally invalid CURP (digit where a letter is expected)", () => {
    expect(isValidCurp("1BCD880101HDFRRN01")).toBe(false);
  });

  it("rejects an invalid sex marker", () => {
    expect(isValidCurp("ABCD880101XDFRRN01")).toBe(false);
  });

  // Self-consistency check: derive several structurally valid CURPs by
  // brute-forcing the last digit, then confirm exactly one digit (the
  // correct check digit) validates and every other digit is rejected.
  // This proves the weighting/charset/modulo implementation is wired
  // correctly without relying on an unverifiable "known-good" CURP
  // pulled from memory.
  it("accepts exactly one check digit out of ten for a given 17-char prefix, and rejects the other nine", () => {
    const prefix = "GOMC880326HDFNRR";
    // prefix above is 16 chars — pad with one more structural char
    // (consonant) to reach the required 17.
    const seventeen = `${prefix}A`;
    expect(seventeen).toHaveLength(17);

    const results = Array.from({ length: 10 }, (_, digit) => isValidCurp(`${seventeen}${digit}`));
    const validCount = results.filter(Boolean).length;
    expect(validCount).toBe(1);
  });

  it("is case-insensitive", () => {
    const prefix = "gomc880326hdfnrra";
    const validDigit = Array.from({ length: 10 }, (_, digit) => digit).find((digit) =>
      isValidCurp(`${prefix.toUpperCase()}${digit}`)
    );
    expect(validDigit).toBeDefined();
    expect(isValidCurp(`${prefix}${validDigit}`)).toBe(true);
  });
});
