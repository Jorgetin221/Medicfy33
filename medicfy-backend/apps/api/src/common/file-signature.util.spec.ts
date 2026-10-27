import { describe, expect, it } from "vitest";
import { assertContentMatchesDeclaredType, fileResponse } from "./file-signature.util";

// Auditoría 2026-10-21, M-07.
describe("file signatures", () => {
  it("accepts a real PDF, JPEG and PNG", () => {
    expect(() => assertContentMatchesDeclaredType(Buffer.from("%PDF-1.7 ..."), "application/pdf")).not.toThrow();
    expect(() => assertContentMatchesDeclaredType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg")).not.toThrow();
    expect(() =>
      assertContentMatchesDeclaredType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]), "image/png")
    ).not.toThrow();
  });

  it("rejects HTML disguised as a PDF", () => {
    expect(() => assertContentMatchesDeclaredType(Buffer.from("<html><script>alert(1)</script>"), "application/pdf")).toThrow();
  });

  it("serves PDFs inline and anything else as a download", () => {
    expect(fileResponse(Buffer.from("x"), "application/pdf").getHeaders().disposition).toBe("inline");
    expect(fileResponse(Buffer.from("x"), "text/xml").getHeaders().disposition).toBe("attachment");
  });
});
