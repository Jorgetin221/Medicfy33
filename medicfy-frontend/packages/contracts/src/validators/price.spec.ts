import { describe, expect, it } from "vitest";
import { isValidPriceMxn } from "./price";

describe("isValidPriceMxn", () => {
  it("accepts the boundaries", () => {
    expect(isValidPriceMxn(1)).toBe(true);
    expect(isValidPriceMxn(99_999)).toBe(true);
  });

  it("rejects zero and negative", () => {
    expect(isValidPriceMxn(0)).toBe(false);
    expect(isValidPriceMxn(-5)).toBe(false);
  });

  it("rejects above the cap", () => {
    expect(isValidPriceMxn(100_000)).toBe(false);
  });

  it("rejects non-integers", () => {
    expect(isValidPriceMxn(499.99)).toBe(false);
  });
});
