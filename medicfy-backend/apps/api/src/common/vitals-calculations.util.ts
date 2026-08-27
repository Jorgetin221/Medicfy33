// IMC: nunca se acepta del cliente (vitalsSchema es .strict(), un
// cliente no puede ni mandarlo) — se calcula aquí y se guarda junto
// con la fórmula usada, para que un cambio de fórmula futuro no
// vuelva ambiguos los valores históricos ya almacenados.
const BMI_FORMULA = "peso_kg / (talla_cm / 100)^2";
const BMI_FORMULA_VERSION = 1;

export function withComputedVitals<T extends { weightKg?: number | undefined; heightCm?: number | undefined }>(
  vitals: T
): T & { bmi?: number; bmiFormula?: string; bmiFormulaVersion?: number } {
  if (vitals.weightKg === undefined || vitals.heightCm === undefined) {
    return vitals;
  }
  const heightM = vitals.heightCm / 100;
  const bmi = Math.round((vitals.weightKg / (heightM * heightM)) * 10) / 10;
  return { ...vitals, bmi, bmiFormula: BMI_FORMULA, bmiFormulaVersion: BMI_FORMULA_VERSION };
}


// Prompt 27 — superficie corporal. FÓRMULA: Mosteller (1987, NEJM
// 317:1098): BSA m² = √(talla_cm × peso_kg / 3600). Se elige por ser
// la de uso clínico más extendido y la más simple de auditar.
// Verificación contra caso publicado: 180 cm y 80 kg →
// √(14400/3600) = √4 = 2.00 m² exactos.
const BSA_FORMULA = "raiz((talla_cm * peso_kg) / 3600) [Mosteller 1987]";
const BSA_FORMULA_VERSION = 1;

export function withBodySurfaceArea<T extends { weightKg?: number | undefined; heightCm?: number | undefined }>(
  vitals: T
): T & { bsaM2?: number; bsaFormula?: string; bsaFormulaVersion?: number } {
  if (vitals.weightKg === undefined || vitals.heightCm === undefined) return vitals;
  const bsa = Math.round(Math.sqrt((vitals.heightCm * vitals.weightKg) / 3600) * 100) / 100;
  return { ...vitals, bsaM2: bsa, bsaFormula: BSA_FORMULA, bsaFormulaVersion: BSA_FORMULA_VERSION };
}

// Prompt 27 — percentilas LMS (OMS/CDC): percentil = Φ(z),
// z = ((valor/M)^L − 1) / (L·S) con L≠0; z = ln(valor/M)/S con L=0.
// Fórmula estándar de los growth standards de la OMS.
export const LMS_FORMULA = "percentil = Phi(((valor/M)^L - 1)/(L*S)) [LMS OMS/CDC]";

export function lmsPercentile(value: number, l: number, m: number, s: number): number {
  const z = l === 0 ? Math.log(value / m) / s : (Math.pow(value / m, l) - 1) / (l * s);
  const clamped = Math.max(-4, Math.min(4, z));
  const percentile = 50 * (1 + erf(clamped / Math.SQRT2));
  return Math.round(percentile * 100) / 100;
}

// Aproximación de Abramowitz & Stegun 7.1.26 (error < 1.5e-7) — más
// que suficiente para percentilas clínicas con 2 decimales.
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}
