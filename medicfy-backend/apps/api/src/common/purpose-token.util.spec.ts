import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { signPurposeToken, verifyPurposeToken } from "./purpose-token.util";

const USER_ID = "7f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f";
const accessSchema = z.object({ sub: z.string().uuid(), primaryRole: z.enum(["DOCTOR", "PATIENT"]) });
const mfaSchema = z.object({ sub: z.string().uuid() });

// Auditoría 2026-10-21, C-01: un token de un propósito nunca verifica
// como token de otro propósito.
describe("purpose tokens", () => {
  it("verifies a token for its own purpose", () => {
    const token = signPurposeToken("access", { sub: USER_ID, primaryRole: "DOCTOR" }, 60);
    expect(verifyPurposeToken("access", token, accessSchema)).toEqual({ sub: USER_ID, primaryRole: "DOCTOR" });
  });

  it("rejects an mfa_pending token used as an access token", () => {
    const mfaToken = signPurposeToken("mfa_pending", { sub: USER_ID }, 60);
    expect(() => verifyPurposeToken("access", mfaToken, mfaSchema)).toThrow();
  });

  it("rejects a document_view token used as an access token", () => {
    const docToken = signPurposeToken("document_view", { sub: USER_ID, documentId: "d", patientId: "p" }, 60);
    expect(() => verifyPurposeToken("access", docToken, mfaSchema)).toThrow();
  });

  it("rejects an access token used as an mfa_pending token", () => {
    const token = signPurposeToken("access", { sub: USER_ID, primaryRole: "DOCTOR" }, 60);
    expect(() => verifyPurposeToken("mfa_pending", token, mfaSchema)).toThrow();
  });

  it("rejects a legacy token signed with the raw secret and no audience", () => {
    const secret = process.env.JWT_ACCESS_SECRET ?? "";
    const legacy = jwt.sign({ sub: USER_ID, purpose: "mfa_pending" }, secret, { expiresIn: 60 });
    expect(() => verifyPurposeToken("access", legacy, accessSchema)).toThrow();
  });

  it("rejects a token whose payload fails the schema (missing role)", () => {
    const token = signPurposeToken("access", { sub: USER_ID }, 60);
    expect(() => verifyPurposeToken("access", token, accessSchema)).toThrow();
  });

  it("rejects alg=none tokens", () => {
    const unsigned = jwt.sign({ sub: USER_ID, primaryRole: "DOCTOR", aud: "access" }, "", { algorithm: "none" });
    expect(() => verifyPurposeToken("access", unsigned, accessSchema)).toThrow();
  });
});
