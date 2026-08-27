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
