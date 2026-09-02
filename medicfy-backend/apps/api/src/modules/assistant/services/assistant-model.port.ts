import type { AssistantPass, AssistantReading } from "@medicfy/contracts";
import type { AssembledAssistantContext } from "../assistant-context.types";

export const ASSISTANT_MODEL_PORT = Symbol("ASSISTANT_MODEL_PORT");

export interface AssistantModelCallInput {
  context: AssembledAssistantContext;
  hashContexto: string;
  pase: AssistantPass;
  signal: AbortSignal;
}

export interface AssistantModelCallResult {
  reading: AssistantReading;
  modelVersion: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
}

// "DEGRADACIÓN HONESTA: si el modelo no responde a tiempo, la pestaña
// dice que no está disponible y la consulta continúa" (Prompt 51). Un
// resultado de este puerto es SIEMPRE uno de estos tres casos —nunca
// una excepción sin tipar que el orquestador tenga que adivinar cómo
// mostrar.
export type AssistantModelOutcome =
  | { kind: "ok"; result: AssistantModelCallResult }
  | { kind: "unavailable"; reason: "TIMEOUT" | "NOT_CONFIGURED" | "PROVIDER_ERROR" | "INVALID_OUTPUT" }
  | { kind: "cancelled" };

// "Resumen objetivo" — llamada deliberadamente más pequeña que
// generateReading(): mismo contexto ensamblado, pero SIN pase (no
// está atado a una sección del SOAP — "en cualquier momento de la
// consulta") y con una salida de un solo campo, para que "dure
// menos" de verdad (petición explícita del usuario, 2026-09-02).
export interface AssistantSummaryCallInput {
  context: AssembledAssistantContext;
  hashContexto: string;
  signal: AbortSignal;
}

export type AssistantSummaryOutcome =
  | { kind: "ok"; resumen: string }
  | { kind: "unavailable"; reason: "TIMEOUT" | "NOT_CONFIGURED" | "PROVIDER_ERROR" | "INVALID_OUTPUT" }
  | { kind: "cancelled" };

export interface AssistantModelPort {
  generateReading(input: AssistantModelCallInput): Promise<AssistantModelOutcome>;
  generateSummary(input: AssistantSummaryCallInput): Promise<AssistantSummaryOutcome>;
}
