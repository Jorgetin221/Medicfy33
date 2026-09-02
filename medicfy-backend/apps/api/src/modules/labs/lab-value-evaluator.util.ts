// Capa 2 (v2.5) — marcado determinista, servidor, NUNCA el modelo de
// IA (M10-RN-008). Puro, sin acceso a base de datos — mismo patrón
// que vital-ranges.util.ts: quien llama ya resolvió qué rango aplica
// (impreso en la hoja o de lab_reference_ranges) y esta función solo
// compara. Prioridad: (1) el rango impreso en la propia hoja, si
// vino con confianza suficiente; (2) lab_reference_ranges. Un rango
// impreso nunca trae su propio "valor de pánico" — el crítico solo
// existe cuando se resuelve contra el sistema.

export type LabValueStatus = "normal" | "low" | "high" | "critical" | "unknown";
export type LabRangeSource = "sheet" | "system" | "none";

export interface LabPrintedRange {
  min: number;
  max: number;
}

export interface LabSystemRange {
  min: number;
  max: number;
  criticalMin?: number;
  criticalMax?: number;
}

export interface LabValueEvaluation {
  status: LabValueStatus;
  rangeMin: number | null;
  rangeMax: number | null;
  rangeSource: LabRangeSource;
}

export function evaluateLabValue(params: {
  value: number;
  printedRange?: LabPrintedRange | null;
  systemRange?: LabSystemRange | null;
}): LabValueEvaluation {
  const { value, printedRange, systemRange } = params;

  if (printedRange) {
    const status: LabValueStatus = value < printedRange.min ? "low" : value > printedRange.max ? "high" : "normal";
    return { status, rangeMin: printedRange.min, rangeMax: printedRange.max, rangeSource: "sheet" };
  }

  if (systemRange) {
    const critical =
      (systemRange.criticalMin !== undefined && value < systemRange.criticalMin) ||
      (systemRange.criticalMax !== undefined && value > systemRange.criticalMax);
    const status: LabValueStatus = critical
      ? "critical"
      : value < systemRange.min
        ? "low"
        : value > systemRange.max
          ? "high"
          : "normal";
    return { status, rangeMin: systemRange.min, rangeMax: systemRange.max, rangeSource: "system" };
  }

  return { status: "unknown", rangeMin: null, rangeMax: null, rangeSource: "none" };
}
