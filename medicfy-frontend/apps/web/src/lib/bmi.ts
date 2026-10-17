// IMC en pantalla, al momento de escribir peso y talla. Misma fórmula y
// redondeo que el servidor (vitals-calculations.util.ts: peso_kg /
// (talla_cm / 100)^2, un decimal). El valor que se GUARDA lo sigue
// calculando el servidor (Prompt 27); esto es solo la vista inmediata.
const CM_PER_M = 100;

export function computeBmi(weightKg: number | undefined, heightCm: number | undefined): number | null {
  if (!weightKg || !heightCm || weightKg <= 0 || heightCm <= 0) return null;
  const heightM = heightCm / CM_PER_M;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

export type BmiCategory = "BAJO_PESO" | "NORMAL" | "SOBREPESO" | "OBESIDAD_I" | "OBESIDAD_II" | "OBESIDAD_III";

// FUENTE: clasificación del IMC en adultos de la OMS (WHO, "Body mass
// index - BMI"; puntos de corte 18.5 / 25 / 30 / 35 / 40). Solo ≥18
// años: en niños el IMC se interpreta por percentil (curvas OMS/CDC),
// no con estos cortes. PENDIENTE(jorge): validar si se prefieren los
// cortes de NOM-008-SSA3-2017 para talla baja.
const ADULT_AGE_YEARS = 18;
const CUTOFFS: [number, BmiCategory][] = [
  [40, "OBESIDAD_III"],
  [35, "OBESIDAD_II"],
  [30, "OBESIDAD_I"],
  [25, "SOBREPESO"],
  [18.5, "NORMAL"],
];

export function bmiCategory(bmi: number, ageYears: number | null): BmiCategory | null {
  if (ageYears === null || ageYears < ADULT_AGE_YEARS) return null;
  return CUTOFFS.find(([min]) => bmi >= min)?.[1] ?? "BAJO_PESO";
}
