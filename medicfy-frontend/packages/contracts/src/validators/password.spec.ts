import { describe, expect, it } from "vitest";
import { isStrongPassword } from "./password";

describe("isStrongPassword", () => {
  it("rejects passwords under 8 characters", () => {
    expect(isStrongPassword("Xk9$mQ2")).toBe(false);
  });

  it("accepts exactly 8 characters", () => {
    expect(isStrongPassword("12345678")).toBe(true);
  });

  it("accepts any password of 8+ characters regardless of composition", () => {
    expect(isStrongPassword("password")).toBe(true);
  });

  it("accepts a long, high-entropy passphrase", () => {
    expect(isStrongPassword("Correcto-Caballo-Bateria-47!Grafito")).toBe(true);
  });
});
