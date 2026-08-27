// Prompt 26 — rangos de validación por edad y marcas de "fuera de
// rango" y "valor crítico".
//
// FUENTES: rangos pediátricos de referencia PALS/AHA (frecuencia
// cardiaca y respiratoria por edad) y valores de alarma de uso
// generalizado en adultos (crisis hipertensiva ≥180/120 según
// ACC/AHA 2017; SpO2 <85% como hipoxemia crítica; temperatura ≥41°C /
// ≤35°C). DECISIÓN DELEGADA pendiente de validación médica de Jorge —
// los umbrales exactos están aquí, en UN solo lugar, para que su
// revisión sea un diff de este archivo.
export interface VitalRangeFlags {
  outOfRange: string[];
  critical: string[];
}

interface Range {
  min: number;
  max: number;
  criticalMin?: number;
  criticalMax?: number;
}

function heartRateRange(ageYears: number): Range {
  if (ageYears < 1) return { min: 100, max: 160, criticalMin: 60, criticalMax: 220 };
  if (ageYears < 3) return { min: 90, max: 150, criticalMin: 55, criticalMax: 200 };
  if (ageYears < 6) return { min: 80, max: 140, criticalMin: 50, criticalMax: 190 };
  if (ageYears < 12) return { min: 70, max: 120, criticalMin: 45, criticalMax: 180 };
  return { min: 60, max: 100, criticalMin: 40, criticalMax: 160 };
}

function respiratoryRateRange(ageYears: number): Range {
  if (ageYears < 1) return { min: 30, max: 53, criticalMin: 15, criticalMax: 70 };
  if (ageYears < 3) return { min: 22, max: 37, criticalMin: 12, criticalMax: 60 };
  if (ageYears < 6) return { min: 20, max: 28, criticalMin: 10, criticalMax: 50 };
  if (ageYears < 12) return { min: 18, max: 25, criticalMin: 10, criticalMax: 45 };
  return { min: 12, max: 20, criticalMin: 8, criticalMax: 40 };
}

function systolicRange(ageYears: number): Range {
  if (ageYears < 1) return { min: 72, max: 104, criticalMin: 60, criticalMax: 130 };
  if (ageYears < 6) return { min: 86, max: 110, criticalMin: 70, criticalMax: 140 };
  if (ageYears < 12) return { min: 97, max: 115, criticalMin: 80, criticalMax: 150 };
  return { min: 90, max: 129, criticalMin: 80, criticalMax: 180 };
}

function diastolicRange(ageYears: number): Range {
  if (ageYears < 12) return { min: 50, max: 75, criticalMin: 40, criticalMax: 100 };
  return { min: 60, max: 84, criticalMin: 40, criticalMax: 120 };
}

const SPO2: Range = { min: 94, max: 100, criticalMin: 85 };
const TEMP: Range = { min: 36, max: 37.5, criticalMin: 35, criticalMax: 41 };

function evaluate(name: string, value: number | undefined, range: Range, flags: VitalRangeFlags): void {
  if (value === undefined) return;
  const critical =
    (range.criticalMin !== undefined && value < range.criticalMin) ||
    (range.criticalMax !== undefined && value > range.criticalMax);
  if (critical) {
    flags.critical.push(name);
    flags.outOfRange.push(name);
    return;
  }
  if (value < range.min || value > range.max) flags.outOfRange.push(name);
}

export function evaluateVitalRanges(
  ageYears: number,
  vitals: {
    bpSystolic?: number | undefined;
    bpDiastolic?: number | undefined;
    heartRate?: number | undefined;
    respiratoryRate?: number | undefined;
    tempC?: number | undefined;
    spo2?: number | undefined;
  }
): VitalRangeFlags {
  const flags: VitalRangeFlags = { outOfRange: [], critical: [] };
  evaluate("bpSystolic", vitals.bpSystolic, systolicRange(ageYears), flags);
  evaluate("bpDiastolic", vitals.bpDiastolic, diastolicRange(ageYears), flags);
  evaluate("heartRate", vitals.heartRate, heartRateRange(ageYears), flags);
  evaluate("respiratoryRate", vitals.respiratoryRate, respiratoryRateRange(ageYears), flags);
  evaluate("tempC", vitals.tempC, TEMP, flags);
  evaluate("spo2", vitals.spo2, SPO2, flags);
  return flags;
}
