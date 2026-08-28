import { createHash } from "node:crypto";

// Fase 6 · Prompt 45: Postgres (jsonb) no garantiza conservar el orden
// de inserción de las claves de un objeto al releerlo — sign() y el
// verificador de integridad podrían construir el mismo `vitals`/
// `specialtyData` con distinto orden de claves y producir hashes
// distintos para contenido IDÉNTICO (falso positivo de alteración).
// Ordenar recursivamente las claves antes de stringificar elimina ese
// riesgo por completo, para cualquier valor anidado, no solo vitals.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

// M8-CA-004/M9-CA-006: hash del contenido firmado, encadenado con el
// anterior — alterar una fila en base de datos directamente rompe la
// cadena. Serialización canónica (claves ordenadas recursivamente,
// ver canonicalize arriba) — suficiente para detectar alteración, no
// pretende ser un formato de interoperabilidad.
export function sha256Hex(input: unknown): string {
  const canonical = typeof input === "string" ? input : JSON.stringify(canonicalize(input));
  return createHash("sha256").update(canonical).digest("hex");
}

// Fase 6 · Prompt 45: proyección del contenido firmado usada para
// calcular contentHashSha256 — MÍNIMA y directamente reconstruible
// después desde lo que queda guardado (clinical_notes/
// encounter_diagnoses/encounter_specialty_data), a propósito. La
// versión original (Fase 3) mezclaba valores derivados —percentilas,
// la key legible del tipo de nota— que no viven en ninguna columna
// propia; verificar el sello después habría exigido volver a correr
// esa misma lógica de negocio en vez de solo releer filas. sign() y
// el verificador de integridad (note-integrity.service.ts) llaman
// EXACTAMENTE a esta función con los mismos valores — es la única
// forma de garantizar el mismo orden de claves en ambos lados, del
// que depende que JSON.stringify produzca el mismo hash.
export interface SignedNoteHashInput {
  note: {
    chiefComplaint: string;
    currentIllness: string;
    physicalExam: string | null;
    assessment: string;
    plan: string;
    prognosis: string | null;
    vitals: unknown;
    specialtyCode: string | null;
    noteTypeTermId: string | null;
    patientInstructions: string | null;
    suggestedFollowUpDays: number | null;
  };
  diagnoses: {
    icd10CodeId: string | null;
    codeAbsentReason: string | null;
    description: string;
    diagnosisType: string;
    certainty: string;
  }[];
  specialtyData: unknown;
  previousHashSha256: string | null;
  encounterId: string;
}

export function buildSignedNoteHashInput(input: SignedNoteHashInput): unknown {
  return {
    note: {
      chiefComplaint: input.note.chiefComplaint,
      currentIllness: input.note.currentIllness,
      physicalExam: input.note.physicalExam,
      assessment: input.note.assessment,
      plan: input.note.plan,
      prognosis: input.note.prognosis,
      vitals: input.note.vitals,
      specialtyCode: input.note.specialtyCode,
      noteTypeTermId: input.note.noteTypeTermId,
      patientInstructions: input.note.patientInstructions,
      suggestedFollowUpDays: input.note.suggestedFollowUpDays,
    },
    diagnoses: input.diagnoses.map((d) => ({
      icd10CodeId: d.icd10CodeId,
      codeAbsentReason: d.codeAbsentReason,
      description: d.description,
      diagnosisType: d.diagnosisType,
      certainty: d.certainty,
    })),
    specialtyData: input.specialtyData,
    previousHashSha256: input.previousHashSha256,
    encounterId: input.encounterId,
  };
}
