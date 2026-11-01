import { Injectable } from "@nestjs/common";
import type { Decimal } from "@prisma/client/runtime/library";
import type { SensitiveCategory, ShareScope, SharedRecordSummary } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { PatientClinicalService } from "../../records/services/patient-clinical.service";
import { LabResultAnalyteService } from "../../labs/services/lab-result-analyte.service";
import { isIcd10CodeExcluded, MENTAL_HEALTH_SPECIALTY_CODES } from "../record-share-sensitive-filter.util";

export interface SharedSummaryGrantLike {
  patientId: string;
  scope: ShareScope[];
  excludedCategories: SensitiveCategory[];
  pregnancyExcluded: boolean;
}

function toNumberOrNull(value: Decimal | null): number | null {
  return value === null ? null : Number(value);
}

// notesTimeline ya filtra status="SIGNED" — signedAt siempre está
// puesto para un encuentro firmado (invariante de
// ClinicalEncounterService.sign()), aunque la columna sea nullable
// para el estado DRAFT. Lanzar aquí (en vez de `!`, prohibido por
// lint) documenta la invariante y falla alto si alguna vez se rompe.
function mustSignedAt(signedAt: Date | null): Date {
  if (!signedAt) throw new Error("Encuentro firmado sin signedAt — invariante rota.");
  return signedAt;
}

/**
 * PR-EXP-04. Construye el Resumen clínico compartible a partir de
 * RecordShareGrant — REUTILIZA PatientClinicalService/
 * LabResultAnalyteService tal cual (mismo patrón que
 * ContextAssemblerService, 00-DESCUBRIMIENTO.md Q7), nunca duplica
 * sus consultas ni toca la Zona 1 del custodio. RE2: solo datos de
 * notas FIRMADAS (ya garantizado por los métodos reutilizados — ver
 * docs/expediente-compartido/04-resumen-clinico-compartible.md
 * hallazgo 1 — y por que Prescription/LabOrder solo existen sobre
 * encuentros firmados, hallazgo 7). RE3/D-EXP-08: el filtro de
 * sensibles se aplica aquí, antes de devolver nada — nunca en
 * PR-EXP-05.
 */
@Injectable()
export class SharedSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientClinical: PatientClinicalService,
    private readonly labResultAnalytes: LabResultAnalyteService
  ) {}

  async buildSummary(grant: SharedSummaryGrantLike): Promise<SharedRecordSummary> {
    const { patientId, excludedCategories, pregnancyExcluded, scope } = grant;
    const sensitiveEncounterIds = await this.sensitiveEncounterIds(patientId, excludedCategories);

    const [allergies, medications, diagnoses, historyItems, pregnancy, vitals] = await Promise.all([
      this.patientClinical.listAllergies(patientId),
      this.patientClinical.listMedications(patientId),
      this.patientClinical.activeDiagnoses(patientId),
      this.patientClinical.listHistoryItems(patientId),
      pregnancyExcluded ? Promise.resolve(null) : this.patientClinical.getActivePregnancy(patientId),
      this.patientClinical.vitalsHistory(patientId),
    ]);

    const latestVitals = vitals.length > 0 ? vitals[vitals.length - 1] : undefined;

    let results: SharedRecordSummary["results"] = null;
    if (scope.includes("RESULTS")) {
      const analytes = await this.labResultAnalytes.listForPatient(patientId);
      // 00-DESCUBRIMIENTO.md bloqueador 3, cerrado aquí: nunca un
      // analito sin revisar. GENETIC: construido, sin dato real que
      // filtrar todavía (hallazgo 5 del plan — ningún catálogo marca
      // un estudio como genético).
      results = analytes
        .filter((a) => a.reviewedAt !== null)
        .map((a) => ({
          analyteName: a.analyteName,
          value: Number(a.value),
          unit: a.unit,
          referenceMin: toNumberOrNull(a.referenceMin),
          referenceMax: toNumberOrNull(a.referenceMax),
          measuredAt: a.measuredAt.toISOString(),
        }));
    }

    let signedNotes: SharedRecordSummary["signedNotes"] = null;
    if (scope.includes("SIGNED_NOTES")) {
      const threads = await this.patientClinical.notesTimeline(patientId, {});
      signedNotes = threads
        .filter((thread) => !sensitiveEncounterIds.has(thread.encounterId))
        .map((thread) => ({
          encounterId: thread.encounterId,
          encounterType: thread.encounterType,
          signedAt: mustSignedAt(thread.signedAt).toISOString(),
          doctorName: `${thread.doctor.legalFirstName} ${thread.doctor.legalLastName}`,
          doctorSpecialtyName: thread.doctor.primarySpecialty?.nameEs ?? null,
          chiefComplaint: thread.note.chiefComplaint,
          currentIllness: thread.note.currentIllness,
          physicalExam: thread.note.physicalExam,
          assessment: thread.note.assessment,
          plan: thread.note.plan,
          prognosis: thread.note.prognosis,
        }));
    }

    let prescriptions: SharedRecordSummary["prescriptions"] = null;
    if (scope.includes("PRESCRIPTIONS")) {
      // RE2 — PR-EXP-07 (batería, "borradores nunca visibles"): desde
      // la Fase 4b una receta SÍ puede emitirse sobre un encuentro en
      // DRAFT (assertEncounterEditableForDocuments), así que "solo
      // firmadas" NO lo garantiza el modelo — se filtra aquí por el
      // estado del encuentro, igual que las notas.
      const rows = await this.prisma.prescription.findMany({
        where: { patientId, encounter: { status: "SIGNED" }, encounterId: { notIn: [...sensitiveEncounterIds] } },
        orderBy: { issuedAt: "desc" },
      });
      prescriptions = rows.map((r) => ({ id: r.id, folio: r.folio, issuedAt: r.issuedAt.toISOString(), diagnosisSnapshot: r.diagnosisSnapshot }));
    }

    let studyOrders: SharedRecordSummary["studyOrders"] = null;
    if (scope.includes("STUDY_ORDERS")) {
      // RE2 — mismo motivo que las recetas (Fase 4b: orden sobre DRAFT).
      const rows = await this.prisma.labOrder.findMany({
        where: { patientId, encounter: { status: "SIGNED" }, encounterId: { notIn: [...sensitiveEncounterIds] } },
        orderBy: { issuedAt: "desc" },
      });
      studyOrders = rows.map((r) => ({ id: r.id, folio: r.folio, issuedAt: r.issuedAt.toISOString(), clinicalIndication: r.clinicalIndication }));
    }

    return {
      // Alergias SIEMPRE primero — mismo criterio de prominencia que
      // la Zona 1 (CLAUDE.md §6), aquí como primera clave del objeto.
      allergies: allergies.map((a) => ({
        id: a.id,
        substance: a.substance,
        allergyType: a.allergyType,
        severity: a.severity,
        reaction: a.reaction,
        certainty: a.certainty,
        status: a.status,
      })),
      medications: medications.map((m) => ({
        id: m.id,
        genericName: m.genericName,
        brandName: m.brandName,
        dose: m.dose,
        route: m.route,
        frequency: m.frequency,
        status: m.status,
      })),
      activeDiagnoses: diagnoses
        .filter((d) => !isIcd10CodeExcluded(d.icd10Code, excludedCategories))
        .map((d) => ({
          icd10Code: d.icd10Code,
          description: d.description,
          diagnosisType: d.diagnosisType,
          certainty: d.certainty,
          firstRecordedAt: d.firstRecordedAt.toISOString(),
          lastRecordedAt: d.lastRecordedAt.toISOString(),
        })),
      // "Antecedentes relevantes": sin filtro por categoría (ver
      // hallazgo 6 del plan — ⚠️ revisión médica pendiente, no hay
      // campo cerrado que mapee subtipo→categoría sensible sin
      // inventarlo).
      historyItems: historyItems.map((h) => ({ category: h.category, subtype: h.subtype, status: h.status, freeText: h.freeText })),
      pregnancy: pregnancy
        ? { eddDate: pregnancy.eddDate.toISOString(), eddMethod: pregnancy.eddMethod, gestationalAge: pregnancy.gestationalAge }
        : null,
      latestVitals: latestVitals
        ? {
            recordedAt: latestVitals.recordedAt.toISOString(),
            bpSystolicMmHg: latestVitals.bpSystolicMmHg,
            bpDiastolicMmHg: latestVitals.bpDiastolicMmHg,
            heartRateBpm: latestVitals.heartRateBpm,
            respiratoryRateBpm: latestVitals.respiratoryRateBpm,
            temperatureC: toNumberOrNull(latestVitals.temperatureC),
            spo2Percent: latestVitals.spo2Percent,
            weightKg: toNumberOrNull(latestVitals.weightKg),
            heightCm: toNumberOrNull(latestVitals.heightCm),
            bmi: toNumberOrNull(latestVitals.bmi),
          }
        : null,
      results,
      signedNotes,
      prescriptions,
      studyOrders,
    };
  }

  // Un encuentro se marca "sensible" si CUALQUIERA de sus diagnósticos
  // cae en una categoría excluida, o si la especialidad de su médico
  // está en la lista de "siempre sensible" (hoy no-op — hallazgo 3 del
  // plan: ninguna especialidad de ese tipo existe en el catálogo
  // sembrado). Nota/receta/orden completas se ocultan, nunca se
  // redacta texto libre parcialmente.
  private async sensitiveEncounterIds(patientId: string, excludedCategories: SensitiveCategory[]): Promise<Set<string>> {
    if (excludedCategories.length === 0) return new Set();

    const diagnoses = await this.prisma.encounterDiagnosis.findMany({
      where: { encounter: { patientId, status: "SIGNED" } },
      select: { encounterId: true, icd10Code: true },
    });
    const ids = new Set<string>();
    for (const diagnosis of diagnoses) {
      if (isIcd10CodeExcluded(diagnosis.icd10Code, excludedCategories)) ids.add(diagnosis.encounterId);
    }

    if (excludedCategories.includes("MENTAL_HEALTH")) {
      const bySpecialty = await this.prisma.clinicalEncounter.findMany({
        where: { patientId, status: "SIGNED", doctor: { primarySpecialty: { code: { in: MENTAL_HEALTH_SPECIALTY_CODES } } } },
        select: { id: true },
      });
      for (const encounter of bySpecialty) ids.add(encounter.id);
    }

    return ids;
  }
}
