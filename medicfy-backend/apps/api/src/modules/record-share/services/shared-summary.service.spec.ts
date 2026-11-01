import { describe, expect, it, vi } from "vitest";
import { SharedSummaryService } from "./shared-summary.service";

// Prueba UNITARIA (mocks de Prisma/PatientClinicalService/
// LabResultAnalyteService) — a diferencia de los *.integration.spec.ts
// de PR-EXP-02/03, esta SÍ corre en este entorno (no depende de
// Postgres real): 04-resumen-clinico-compartible.md, plan de pruebas.

const ALLERGY = { id: "al1", substance: "Penicilina", allergyType: "MEDICATION", severity: "GRAVE", reaction: "Urticaria", certainty: "CONFIRMED", status: "ACTIVE" };
const MEDICATION = { id: "me1", genericName: "Metformina", brandName: null, dose: "850mg", route: "oral", frequency: "cada 12h", status: "ACTIVE" };
const F32_DIAGNOSIS = {
  icd10Code: "F32.1",
  description: "Episodio depresivo moderado",
  diagnosisType: "PRINCIPAL",
  certainty: "CONFIRMED",
  firstRecordedAt: new Date("2026-01-01T00:00:00Z"),
  lastRecordedAt: new Date("2026-02-01T00:00:00Z"),
};
const E11_DIAGNOSIS = {
  icd10Code: "E11.9",
  description: "Diabetes mellitus tipo 2",
  diagnosisType: "SECONDARY",
  certainty: "CONFIRMED",
  firstRecordedAt: new Date("2026-01-01T00:00:00Z"),
  lastRecordedAt: new Date("2026-01-01T00:00:00Z"),
};
const SIGNED_NOTE_THREAD = {
  encounterId: "enc-f32",
  encounterType: "FOLLOW_UP",
  signedAt: new Date("2026-02-01T00:00:00Z"),
  doctor: { legalFirstName: "Ana", legalLastName: "García", primarySpecialty: { nameEs: "Medicina General" } },
  note: { chiefComplaint: "Tristeza persistente", currentIllness: "...", physicalExam: null, assessment: "F32.1", plan: "Seguimiento", prognosis: null },
  corrections: [],
};

function buildService(overrides: {
  diagnoses?: typeof F32_DIAGNOSIS[];
  signedNoteEncounterIds?: string[];
  pregnancy?: unknown;
  resultsScopeIncluded?: boolean;
} = {}) {
  const patientClinical = {
    listAllergies: vi.fn().mockResolvedValue([ALLERGY]),
    listMedications: vi.fn().mockResolvedValue([MEDICATION]),
    activeDiagnoses: vi.fn().mockResolvedValue(overrides.diagnoses ?? [F32_DIAGNOSIS, E11_DIAGNOSIS]),
    listHistoryItems: vi.fn().mockResolvedValue([]),
    getActivePregnancy: vi.fn().mockResolvedValue(
      overrides.pregnancy !== undefined
        ? overrides.pregnancy
        : { eddDate: new Date("2027-01-01T00:00:00Z"), eddMethod: "FUM", gestationalAge: { weeks: 20, days: 3 } }
    ),
    vitalsHistory: vi.fn().mockResolvedValue([{ recordedAt: new Date("2026-02-01T00:00:00Z"), bpSystolicMmHg: 120, bpDiastolicMmHg: 80, heartRateBpm: 70, respiratoryRateBpm: 16, temperatureC: 36.5, spo2Percent: 98, weightKg: 70, heightCm: 170, bmi: 24.2 }]),
    notesTimeline: vi.fn().mockResolvedValue([SIGNED_NOTE_THREAD]),
  };
  const labResultAnalytes = {
    listForPatient: vi.fn().mockResolvedValue([
      { analyteName: "Glucosa", value: 95, unit: "mg/dL", referenceMin: 70, referenceMax: 100, measuredAt: new Date("2026-01-15T00:00:00Z"), reviewedAt: new Date("2026-01-16T00:00:00Z") },
      { analyteName: "Sin revisar", value: 1, unit: "x", referenceMin: null, referenceMax: null, measuredAt: new Date("2026-01-15T00:00:00Z"), reviewedAt: null },
    ]),
  };
  const prisma = {
    encounterDiagnosis: {
      findMany: vi.fn().mockResolvedValue(
        (overrides.diagnoses ?? [F32_DIAGNOSIS, E11_DIAGNOSIS]).map((d) => ({ encounterId: "enc-f32", icd10Code: d.icd10Code }))
      ),
    },
    clinicalEncounter: { findMany: vi.fn().mockResolvedValue([]) },
    prescription: { findMany: vi.fn().mockResolvedValue([]) },
    labOrder: { findMany: vi.fn().mockResolvedValue([]) },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new SharedSummaryService(prisma as any, patientClinical as any, labResultAnalytes as any);
}

describe("SharedSummaryService.buildSummary", () => {
  it("alergias siempre son la primera clave del resumen", async () => {
    const service = buildService();
    const summary = await service.buildSummary({ patientId: "p1", scope: ["SUMMARY"], excludedCategories: [], pregnancyExcluded: false });
    expect(Object.keys(summary)[0]).toBe("allergies");
    expect(summary.allergies).toHaveLength(1);
  });

  it("F32 (MENTAL_HEALTH) no aparece en diagnósticos ni en notas si el paciente excluyó MENTAL_HEALTH", async () => {
    const service = buildService();
    const summary = await service.buildSummary({
      patientId: "p1",
      scope: ["SUMMARY", "SIGNED_NOTES"],
      excludedCategories: ["MENTAL_HEALTH"],
      pregnancyExcluded: false,
    });
    expect(summary.activeDiagnoses.map((d) => d.icd10Code)).toEqual(["E11.9"]);
    expect(summary.signedNotes).toEqual([]);
  });

  it("F32 SÍ aparece si el paciente lo incluyó (MENTAL_HEALTH no excluido)", async () => {
    const service = buildService();
    const summary = await service.buildSummary({ patientId: "p1", scope: ["SUMMARY", "SIGNED_NOTES"], excludedCategories: [], pregnancyExcluded: false });
    expect(summary.activeDiagnoses.map((d) => d.icd10Code)).toContain("F32.1");
    expect(summary.signedNotes).toHaveLength(1);
  });

  it("no queda rastro de lo excluido: misma forma de respuesta, solo el arreglo más corto, sin huecos", async () => {
    const service = buildService();
    const withBoth = await service.buildSummary({ patientId: "p1", scope: ["SUMMARY"], excludedCategories: [], pregnancyExcluded: false });
    const withoutMentalHealth = await service.buildSummary({ patientId: "p1", scope: ["SUMMARY"], excludedCategories: ["MENTAL_HEALTH"], pregnancyExcluded: false });
    expect(Object.keys(withBoth)).toEqual(Object.keys(withoutMentalHealth));
    expect(withBoth.activeDiagnoses).toHaveLength(2);
    expect(withoutMentalHealth.activeDiagnoses).toHaveLength(1);
    expect(withoutMentalHealth.activeDiagnoses.some((d) => d === null || d === undefined)).toBe(false);
  });

  it("embarazo activo incluido por defecto y excluible con pregnancyExcluded", async () => {
    const service = buildService();
    const included = await service.buildSummary({ patientId: "p1", scope: ["SUMMARY"], excludedCategories: [], pregnancyExcluded: false });
    expect(included.pregnancy).not.toBeNull();
    const excluded = await service.buildSummary({ patientId: "p1", scope: ["SUMMARY"], excludedCategories: [], pregnancyExcluded: true });
    expect(excluded.pregnancy).toBeNull();
  });

  it("un alcance sin RESULTS no devuelve resultados (null, no arreglo vacío)", async () => {
    const service = buildService();
    const withoutResults = await service.buildSummary({ patientId: "p1", scope: ["SUMMARY"], excludedCategories: [], pregnancyExcluded: false });
    expect(withoutResults.results).toBeNull();
    const withResults = await service.buildSummary({ patientId: "p1", scope: ["SUMMARY", "RESULTS"], excludedCategories: [], pregnancyExcluded: false });
    expect(withResults.results).toHaveLength(1);
    expect(withResults.results?.[0]?.analyteName).toBe("Glucosa");
  });

  it("PRESCRIPTIONS/STUDY_ORDERS/SIGNED_NOTES también son null cuando no se pidieron", async () => {
    const service = buildService();
    const summary = await service.buildSummary({ patientId: "p1", scope: ["SUMMARY"], excludedCategories: [], pregnancyExcluded: false });
    expect(summary.signedNotes).toBeNull();
    expect(summary.prescriptions).toBeNull();
    expect(summary.studyOrders).toBeNull();
  });
});
