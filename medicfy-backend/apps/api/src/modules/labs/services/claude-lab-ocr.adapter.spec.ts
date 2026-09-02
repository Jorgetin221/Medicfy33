import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClaudeLabOcrAdapter } from "./claude-lab-ocr.adapter";

// Capa 1 (v2.5) — la parte de ClaudeLabOcrAdapter que SÍ se puede
// probar sin red: la degradación honesta cuando falta la clave. Mismo
// criterio que claude-model.adapter.spec.ts — la llamada real de
// visión se verifica con una hoja real, no un mock del SDK.
describe("ClaudeLabOcrAdapter", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalKey !== undefined) process.env.ANTHROPIC_API_KEY = originalKey;
    else delete process.env.ANTHROPIC_API_KEY;
  });

  it("se degrada a NOT_CONFIGURED sin tumbar el proceso cuando falta ANTHROPIC_API_KEY", async () => {
    const adapter = new ClaudeLabOcrAdapter();
    const outcome = await adapter.extract({
      buffer: Buffer.from("contenido de prueba"),
      contentType: "image/png",
      signal: new AbortController().signal,
    });
    expect(outcome).toEqual({ kind: "unavailable", reason: "NOT_CONFIGURED" });
  });
});
