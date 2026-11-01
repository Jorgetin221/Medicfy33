import type { SensitiveCategory } from "@medicfy/contracts";

// PR-EXP-04 §2 del prompt maestro — rangos CIE-10 LITERALES de la
// letra, no inventados. SUBSTANCE_USE (F10-F19) es subconjunto de
// MENTAL_HEALTH (F00-F99) a propósito: un código puede matchear las
// dos a la vez (p. ej. F10.2, dependencia alcohólica) — ver
// 04-resumen-clinico-compartible.md "Diseño del filtro de sensibles".
type Range = { start: string; end: string; category: SensitiveCategory };
type Single = { code: string; category: SensitiveCategory };

const RANGES: Range[] = [
  { start: "F00", end: "F99", category: "MENTAL_HEALTH" },
  { start: "F10", end: "F19", category: "SUBSTANCE_USE" },
  { start: "B20", end: "B24", category: "HIV_STI" },
  { start: "A50", end: "A64", category: "HIV_STI" },
  { start: "O00", end: "O08", category: "REPRODUCTIVE_HEALTH" },
];
const SINGLES: Single[] = [
  { code: "Z21", category: "HIV_STI" },
  { code: "Z30", category: "REPRODUCTIVE_HEALTH" },
];

// Compara solo los primeros 3 caracteres (letra + 2 dígitos) — un
// código CIE-10 siempre trae esa forma antes del punto decimal
// (00-DESCUBRIMIENTO.md Q12: formato con relleno de ceros), así que
// la comparación lexicográfica de ese prefijo basta para los rangos
// de la letra §2 y no exige campo de capítulo (no existe, Q12).
function prefix3(code: string): string {
  return code.slice(0, 3).toUpperCase();
}

/**
 * Categorías sensibles que matchea un código CIE-10. Un código sin
 * capturar (null — caso codeAbsentReason) no tiene cómo clasificarse:
 * devuelve vacío, nunca se inventa una categoría por el texto libre.
 */
export function sensitiveCategoriesForIcd10Code(icd10Code: string | null): SensitiveCategory[] {
  if (!icd10Code) return [];
  const p = prefix3(icd10Code);
  const categories = new Set<SensitiveCategory>();
  for (const range of RANGES) {
    if (p >= range.start && p <= range.end) categories.add(range.category);
  }
  for (const single of SINGLES) {
    if (p === single.code) categories.add(single.category);
  }
  return [...categories];
}

/**
 * Fail-closed: oculto si CUALQUIERA de sus categorías coincidentes
 * está excluida — nunca al revés. Un código sin categoría (o sin
 * capturar) nunca se oculta por este mecanismo.
 */
export function isIcd10CodeExcluded(icd10Code: string | null, excludedCategories: readonly SensitiveCategory[]): boolean {
  return sensitiveCategoriesForIcd10Code(icd10Code).some((c) => excludedCategories.includes(c));
}

// 🔒 Construido, NO aplicado hoy (04-resumen-clinico-compartible.md
// hallazgo 4): PatientMedication no tiene FK al catálogo de
// medicamentos (solo genericName de texto libre) — no hay cómo
// resolver el atcCode de un medicamento vigente sin inventar un
// emparejamiento por nombre. Prefijos ATC reales (WHO ATC/DDD, no
// inventados) para los TRES ejemplos literales de la letra —
// ⚠️ lista NO exhaustiva, revisión médica pendiente para ampliarla.
export const SENSITIVE_ATC_PREFIXES: Record<string, SensitiveCategory> = {
  J05A: "HIV_STI", // antirretrovirales
  N05A: "MENTAL_HEALTH", // antipsicóticos
  N06A: "MENTAL_HEALTH", // antidepresivos
};

export function sensitiveCategoryForAtcCode(atcCode: string | null): SensitiveCategory | null {
  if (!atcCode) return null;
  return SENSITIVE_ATC_PREFIXES[atcCode.toUpperCase().slice(0, 4)] ?? null;
}

// 🔒 Construido, NO aplicado hoy (hallazgo 3): ninguna especialidad
// "Psiquiatría"/"Psicología" existe en el catálogo sembrado
// (prisma/seed.ts SPECIALTIES) — esto es un no-op hasta que el
// catálogo las tenga. No se inventan aquí (gobierno de catálogo, no
// de esta función).
export const MENTAL_HEALTH_SPECIALTY_CODES = ["PSIQUIATRIA", "PSICOLOGIA"];
