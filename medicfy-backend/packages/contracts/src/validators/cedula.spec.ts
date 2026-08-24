import { describe, expect, it } from "vitest";
import { isValidCedulaFormat } from "./cedula";

describe("isValidCedulaFormat", () => {
  it("accepts 7 digits", () => {
    expect(isValidCedulaFormat("1234567")).toBe(true);
  });

  it("accepts 8 digits", () => {
    expect(isValidCedulaFormat("12345678")).toBe(true);
  });

  it("rejects 6 digits", () => {
    expect(isValidCedulaFormat("123456")).toBe(false);
  });

  it("rejects 9 digits", () => {
    expect(isValidCedulaFormat("123456789")).toBe(false);
  });

  it("rejects non-numeric characters", () => {
    expect(isValidCedulaFormat("123456A")).toBe(false);
  });
});
