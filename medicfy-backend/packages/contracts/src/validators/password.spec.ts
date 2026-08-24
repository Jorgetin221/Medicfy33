import { describe, expect, it } from "vitest";
import { isStrongPassword } from "./password";

describe("isStrongPassword", () => {
  it("rejects passwords under 12 characters even if complex", () => {
    expect(isStrongPassword("Xk9$mQ2!")).toBe(false);
  });

  it("rejects a long but common/low-entropy password", () => {
    expect(isStrongPassword("password12345")).toBe(false);
  });

  it("rejects a long repeated-pattern password", () => {
    expect(isStrongPassword("abcabcabcabc")).toBe(false);
  });

  it("accepts a long, high-entropy passphrase", () => {
    expect(isStrongPassword("Correcto-Caballo-Bateria-47!Grafito")).toBe(true);
  });
});
