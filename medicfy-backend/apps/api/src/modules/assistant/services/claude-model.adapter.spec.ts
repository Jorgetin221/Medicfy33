import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSummarySystemPrompt, buildSystemPrompt, ClaudeModelAdapter } from "./claude-model.adapter";
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
    paciente: { edadAnios: 30, sexo: "F", embarazo: null, tipoSangre: null, residencia: null },
    seguridad: [],
    problemas: [],
    medicacion: [],
    antecedentes: [],
    toxicomanias: [],
    ginecoObstetricos: null,
    laboratorio: [],
    signosVitalesPrevios: [],
    trayectoria: [],
    actual: {},
    signosVitales: { fueraDeRango: [], criticos: [] },
    escalas: [],
    sintomasAlarmaMarcados: [],
    diagnosticosConsulta: [],
    banderasRojasDetectadas: [],
    documentosConsulta: { recetas: [], ordenesEstudio: [] },
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
      locale: "es",
      signal: new AbortController().signal,
    });
    expect(outcome).toEqual({ kind: "unavailable", reason: "NOT_CONFIGURED" });
  });

  // "Si el sistema se pone en inglés, la IA también debe responder en
  // inglés" (usuario, 2026-10-16).
  it("con la interfaz en inglés, el prompt de la lectura exige escribir en inglés sin traducir las claves del contrato", () => {
    const prompt = buildSystemPrompt("OBJETIVO", "en");
    expect(prompt).toContain("Write EVERY free-text value of your output in English");
    expect(prompt).toContain("Keep the JSON keys and the closed enum values");
    expect(prompt).not.toContain("Escribe todo el texto libre de tu respuesta en español.");
  });

  it("con la interfaz en español, el prompt de la lectura pide español", () => {
    const prompt = buildSystemPrompt("OBJETIVO", "es");
    expect(prompt).toContain("Escribe todo el texto libre de tu respuesta en español.");
    expect(prompt).not.toContain("in English");
  });

  it("el resumen objetivo también sigue el idioma de la interfaz", () => {
    expect(buildSummarySystemPrompt("en")).toContain("Write EVERY free-text value of your output in English");
    expect(buildSummarySystemPrompt("es")).toContain("Escribe todo el texto libre de tu respuesta en español.");
  });

  it("el prompt pide usar signos vitales y el resto del contexto clínico", () => {
    const prompt = buildSystemPrompt("SUBJETIVO", "es");
    expect(prompt).toContain("signosVitales");
    expect(prompt).toContain("Todo signo vital fuera de rango debe aparecer explícitamente");
  });
});
