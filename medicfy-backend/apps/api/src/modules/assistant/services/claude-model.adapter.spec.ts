import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClaudeModelAdapter } from "./claude-model.adapter";
import type { AssembledAssistantContext } from "../assistant-context.types";

// Fase 8 · Prompt 51 — la parte de ClaudeModelAdapter que SÍ se puede
// probar sin red: la degradación honesta cuando falta la clave. Todo
// lo demás (la llamada real a Claude, tool-use, el reintento) se
// verifica con una consulta real de humo una vez que exista una
// ANTHROPIC_API_KEY real — un mock del SDK no demostraría que el tool
// schema derivado de assistantModelOutputSchema realmente funciona
// contra el modelo.
function emptyContext(): AssembledAssistantContext {
  return {
    paciente: { edadAnios: 30, sexo: "F", embarazo: null },
    seguridad: [],
    problemas: [],
    medicacion: [],
    antecedentes: [],
    laboratorio: [],
    trayectoria: [],
    actual: {},
    encuadre: { especialidad: "Medicina General", tipoConsulta: "FIRST_VISIT" },
  };
}

describe("ClaudeModelAdapter", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalKey !== undefined) process.env.ANTHROPIC_API_KEY = originalKey;
    else delete process.env.ANTHROPIC_API_KEY;
  });

  it("se degrada a NOT_CONFIGURED sin tumbar el proceso cuando falta ANTHROPIC_API_KEY", async () => {
    const adapter = new ClaudeModelAdapter();
    const outcome = await adapter.generateReading({
      context: emptyContext(),
      hashContexto: "a".repeat(64),
      pase: "SUBJETIVO",
      signal: new AbortController().signal,
    });
    expect(outcome).toEqual({ kind: "unavailable", reason: "NOT_CONFIGURED" });
  });
});
