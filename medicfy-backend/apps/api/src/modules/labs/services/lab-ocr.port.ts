export const LAB_OCR_PORT = Symbol("LAB_OCR_PORT");

export interface LabOcrExtractInput {
  buffer: Buffer;
  contentType: string;
  signal: AbortSignal;
}

export type LabOcrConfidence = "LOW" | "MEDIUM" | "HIGH";

export interface LabOcrRawCandidate {
  analyteNameRaw: string;
  valueRaw: string;
  unitRaw: string | null;
  referenceMinPrinted: number | null;
  referenceMaxPrinted: number | null;
  confidence: LabOcrConfidence;
}

export interface LabOcrExtractResult {
  labNameDetected: string | null;
  resultDateDetected: string | null;
  candidates: LabOcrRawCandidate[];
}

// Capa 1 (v2.5) — puerto/adaptador, mismo patrón exacto que
// ASSISTANT_MODEL_PORT: nada del servicio/controller conoce el SDK
// concreto detrás de este puerto (hoy ClaudeLabOcrAdapter, vía visión
// de Claude — mismo ANTHROPIC_API_KEY que el Segundo Lector), así que
// las pruebas usan un doble y nunca llaman a la red. Un resultado de
// este puerto es SIEMPRE uno de estos tres casos — "DEGRADACIÓN
// HONESTA" también aquí: sin la clave configurada, la función ofrece
// captura manual en vez de romperse.
export type LabOcrOutcome =
  | { kind: "ok"; result: LabOcrExtractResult }
  | { kind: "unavailable"; reason: "NOT_CONFIGURED" | "TIMEOUT" | "PROVIDER_ERROR" | "INVALID_OUTPUT" }
  | { kind: "cancelled" };

export interface LabOcrPort {
  extract(input: LabOcrExtractInput): Promise<LabOcrOutcome>;
}
