// Espejo de medicfy-backend/apps/api/src/common/vital-ranges.util.ts —
// MISMOS umbrales (fuentes: PALS/AHA pediátrico, ACC/AHA 2017 crisis
// hipertensiva adulto, SpO2/temperatura de uso generalizado). Solo
// para dar color inmediato en el campo mientras el médico escribe; el
// servidor vuelve a evaluar esto mismo al firmar (M8-RN-007) y es la
// autoridad real — igual patrón que los min/max de plausibilidad ya
// mirroreados en vitals-fields.tsx. Si cambian los umbrales allá,
// cambian aquí.

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

const RANGE_BY_FIELD: Record<string, (ageYears: number) => Range> = {
  bpSystolic: systolicRange,
  bpDiastolic: diastolicRange,
  heartRate: heartRateRange,
  respiratoryRate: respiratoryRateRange,
  tempC: () => TEMP,
  spo2: () => SPO2,
};

export type VitalRangeStatus = "unknown" | "normal" | "low" | "high" | "critical";

export function vitalRangeStatus(fieldName: string, value: number | undefined, ageYears: number | null): VitalRangeStatus {
  const rangeFn = RANGE_BY_FIELD[fieldName];
  if (!rangeFn || value === undefined || ageYears === null || Number.isNaN(ageYears)) return "unknown";
  const range = rangeFn(ageYears);
  const critical = (range.criticalMin !== undefined && value < range.criticalMin) || (range.criticalMax !== undefined && value > range.criticalMax);
  if (critical) return "critical";
  if (value < range.min) return "low";
  if (value > range.max) return "high";
  return "normal";
}

export const VITAL_RANGE_LABEL: Record<VitalRangeStatus, string | null> = {
  unknown: null,
  normal: null,
  low: "bajo",
  high: "alto",
  critical: "crítico",
};

export const VITAL_RANGE_TILE_CLASS: Record<VitalRangeStatus, string> = {
  unknown: "border-gray-300",
  normal: "border-success-600 bg-success-50",
  low: "border-warn-600 bg-warn-50",
  high: "border-warn-600 bg-warn-50",
  critical: "border-critical-600 bg-critical-50",
};
