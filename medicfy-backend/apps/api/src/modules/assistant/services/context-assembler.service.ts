import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { calculateAge } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { PatientClinicalService } from "../../records/services/patient-clinical.service";
import { LabResultAnalyteService } from "../../labs/services/lab-result-analyte.service";
import { LabReferenceRangeService } from "../../labs/services/lab-reference-range.service";
import { omitUndefined } from "../../../common/omit-undefined";
import { evaluateVitalRanges } from "../../../common/vital-ranges.util";
import { withBodySurfaceArea } from "../../../common/vitals-calculations.util";
import type {
  AssembledAssistantContext,
  AssembledAssistantContextResult,
  AssistantAllergyBlock,
  AssistantCurrentContext,
  AssistantCurrentNoteBlock,
  AssistantEncounterDiagnosisBlock,
  AssistantEncounterDocumentsBlock,
  AssistantEncuadreBlock,
  AssistantGynecoBlock,
  AssistantHistoryBlock,
  AssistantLabBlock,
  AssistantMedicationBlock,
  AssistantPatientBlock,
  AssistantPreviousVitalsBlock,
  AssistantProblemBlock,
  AssistantRedFlagBlock,
  AssistantScaleBlock,
  AssistantStableContext,
  AssistantSubstanceUseBlock,
  AssistantTrajectoryNoteBlock,
  AssistantVitalsBlock,
} from "../assistant-context.types";

// Fase 8 · Prompt 50 (docs/medicfy-58-prompts.md, Bloque 9). "Se arma
// en el servidor, campo por campo, a partir de datos estructurados.
// NUNCA se manda el expediente completo." Cada bloque privado de abajo
// hace su propia consulta con SELECT explícito (o reusa un método de
// PatientClinicalService/LabResultAnalyteService que tampoco toca
// columnas de identidad) — la SEUDONIMIZACIÓN no es un paso de
// "limpieza" al final, es que estas consultas simplemente nunca piden
// nombre, apellidos, CURP, domicilio, teléfono, correo ni folio
// (medicfyId). Edad, sexo, tipo de sangre y municipio/estado sí se
// conservan (cambian el razonamiento clínico; la identidad no aporta
// nada al diferencial).
const TRAJECTORY_NOTE_COUNT = 3;
const PREVIOUS_VITALS_COUNT = 3;
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

type Decimalish = { toString(): string } | null;

@Injectable()
export class ContextAssemblerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientClinical: PatientClinicalService,
    private readonly labResultAnalytes: LabResultAnalyteService,
    private readonly labReferenceRanges: LabReferenceRangeService
  ) {}

  // Arma el contexto completo de un pase y su hash. El endpoint que lo
  // exponga (Prompt 51/53) es responsable de auditar el acceso — mismo
  // patrón que cada controller clínico ya sigue con AuditService, no
  // algo que este servicio deba hacer por sí mismo sin un actor/IP de
  // request.
  async assemble(encounterId: string): Promise<AssembledAssistantContextResult> {
    const encounter = await this.prisma.clinicalEncounter.findUniqueOrThrow({
      where: { id: encounterId },
      select: { patientId: true },
    });
    const [stable, current] = await Promise.all([
      this.assembleStableBlock(encounter.patientId),
      this.assembleCurrentBlock(encounterId),
    ]);
    const context: AssembledAssistantContext = { ...stable, ...current };
    return { context, hashContexto: hashContext(context) };
  }

  // "El bloque estable ... se arma una vez por consulta y se
  // reutiliza": separado de assembleCurrentBlock para que quien
  // orqueste los 4 pases (Prompt 51) pueda llamarlo una sola vez y
  // reusar el resultado — el mecanismo de caché en sí es su decisión,
  // no de este servicio.
  async assembleStableBlock(patientId: string): Promise<AssistantStableContext> {
    const [paciente, seguridad, problemas, medicacion, antecedentes, toxicomanias, ginecoObstetricos, laboratorio, signosVitalesPrevios, trayectoria] =
      await Promise.all([
        this.buildPacienteBlock(patientId),
        this.buildSeguridadBlock(patientId),
        this.buildProblemasBlock(patientId),
        this.buildMedicacionBlock(patientId),
        this.buildAntecedentesBlock(patientId),
        this.buildToxicomaniasBlock(patientId),
        this.buildGinecoBlock(patientId),
        this.buildLaboratorioBlock(patientId),
        this.buildSignosVitalesPreviosBlock(patientId),
        this.buildTrayectoriaBlock(patientId),
      ]);
    return { paciente, seguridad, problemas, medicacion, antecedentes, toxicomanias, ginecoObstetricos, laboratorio, signosVitalesPrevios, trayectoria };
  }

  async assembleCurrentBlock(encounterId: string): Promise<AssistantCurrentContext> {
    const encounter = await this.prisma.clinicalEncounter.findUniqueOrThrow({
      where: { id: encounterId },
      select: {
        encounterType: true,
        draftContent: true,
        doctor: { select: { primarySpecialty: { select: { nameEs: true } } } },
        patient: { select: { birthDate: true } },
      },
    });
    const draft = (encounter.draftContent ?? {}) as Record<string, unknown>;
    const encuadre: AssistantEncuadreBlock = {
      especialidad: encounter.doctor.primarySpecialty?.nameEs ?? null,
      tipoConsulta: encounter.encounterType,
    };
    const [escalas, sintomasAlarmaMarcados, diagnosticosConsulta, banderasRojasDetectadas, documentosConsulta] = await Promise.all([
      this.buildEscalasBlock(draft.specialtyData),
      this.buildSintomasAlarmaBlock(draft.presentingSymptomTermIds),
      this.buildDiagnosticosConsultaBlock(encounterId, draft.diagnoses),
      this.buildBanderasRojasBlock(encounterId),
      this.buildDocumentosConsultaBlock(encounterId),
    ]);
    return {
      actual: buildCurrentNoteBlock(draft),
      signosVitales: buildCurrentVitalsBlock(draft.vitals, calculateAge(encounter.patient.birthDate)),
      escalas,
      sintomasAlarmaMarcados,
      diagnosticosConsulta,
      banderasRojasDetectadas,
      documentosConsulta,
      encuadre,
    };
  }

  private async buildPacienteBlock(patientId: string): Promise<AssistantPatientBlock> {
    const patient = await this.prisma.patient.findUniqueOrThrow({
      where: { id: patientId },
      select: { birthDate: true, sexAtBirth: true, bloodType: true, addressMunicipality: true, addressState: true },
    });
    const pregnancy = await this.patientClinical.getActivePregnancy(patientId);
    const hasResidence = patient.addressMunicipality !== null || patient.addressState !== null;
    return {
      edadAnios: calculateAge(patient.birthDate),
      sexo: patient.sexAtBirth,
      embarazo: pregnancy
        ? { semanasGestacion: pregnancy.gestationalAge.weeks, diasGestacion: pregnancy.gestationalAge.days }
        : null,
      tipoSangre: patient.bloodType,
      residencia: hasResidence ? { municipio: patient.addressMunicipality, estado: patient.addressState } : null,
    };
  }

  private async buildSeguridadBlock(patientId: string): Promise<AssistantAllergyBlock[]> {
    const allergies = await this.patientClinical.listAllergies(patientId);
    return allergies
      .filter((allergy) => allergy.status === "ACTIVE")
      .map((allergy) => ({ sustancia: allergy.substance, reaccion: allergy.reaction ?? null, gravedad: allergy.severity }));
  }

  private async buildProblemasBlock(patientId: string): Promise<AssistantProblemBlock[]> {
    const diagnoses = await this.patientClinical.activeDiagnoses(patientId);
    return diagnoses.map((diagnosis) => ({
      codigoIcd10: diagnosis.icd10Code,
      descripcion: diagnosis.description,
      fecha: diagnosis.lastRecordedAt.toISOString(),
    }));
  }

  private async buildMedicacionBlock(patientId: string): Promise<AssistantMedicationBlock[]> {
    const medications = await this.patientClinical.listMedications(patientId);
    return medications
      .filter((medication) => medication.status === "ACTIVE")
      .map((medication) => ({
        nombreGenerico: medication.genericName,
        dosis: medication.dose,
        via: medication.route,
        frecuencia: medication.frequency,
      }));
  }

  private async buildAntecedentesBlock(patientId: string): Promise<AssistantHistoryBlock[]> {
    const items = await this.patientClinical.listHistoryItems(patientId);
    return items
      .filter((item): item is typeof item & { status: "PRESENTE" | "NEGADO" } => item.status === "PRESENTE" || item.status === "NEGADO")
      .map((item) => ({
        categoria: item.category,
        subtipo: item.subtype,
        estado: item.status,
        parentesco: item.familyRelationship !== "NONE" ? item.familyRelationship : null,
        comentario: item.freeText ?? null,
      }));
  }

  private async buildToxicomaniasBlock(patientId: string): Promise<AssistantSubstanceUseBlock[]> {
    const uses = await this.patientClinical.listSubstanceUses(patientId);
    return uses.map((use) => ({
      sustancia: use.substanceTerm.preferredTerm,
      estado: use.status,
      cantidad: decimalToString(use.quantity),
      unidad: use.unit,
      edadInicio: use.ageOfOnset,
      indiceTabaquico: decimalToString(use.packYears),
      bebidasEstandarPorSemana: decimalToString(use.stdDrinksPerWeek),
      comentario: use.comment,
    }));
  }

  // Misma regla de visibilidad que la pantalla (gynecoVisibility): un
  // bloque que el médico no ve tampoco se le manda al modelo.
  private async buildGinecoBlock(patientId: string): Promise<AssistantGynecoBlock | null> {
    const { history } = await this.patientClinical.getGynecoHistory(patientId);
    if (!history) return null;
    return {
      menarcaEdad: history.menarcheAge,
      cicloDuracionDias: history.cycleDurationDays,
      cicloFrecuenciaDias: history.cycleFrequencyDays,
      cicloCantidad: history.cycleAmount,
      dismenorrea: history.dysmenorrhea,
      otroFlujo: history.otherDischarge,
      inicioVidaSexualEdad: history.sexualOnsetAge,
      parejasSexuales: history.sexualPartners,
      metodoAnticonceptivo: history.contraceptiveMethod,
      frecuenciaSexual: history.sexualFrequency,
      antecedenteIts: history.stiHistory,
      gestas: history.gestas,
      partos: history.partos,
      cesareas: history.cesareas,
      abortos: history.abortos,
      antecedentesPerinatales: history.perinatalHistory,
    };
  }

  private async buildLaboratorioBlock(patientId: string): Promise<AssistantLabBlock[]> {
    const [analytes, patient] = await Promise.all([
      this.labResultAnalytes.listForPatient(patientId),
      this.prisma.patient.findUniqueOrThrow({ where: { id: patientId }, select: { birthDate: true, sexAtBirth: true } }),
    ]);
    // "últimos analitos": un valor por analito (el más reciente), no
    // el historial completo — mismo criterio de "agrupar y quedarse
    // con lo último" que activeDiagnoses ya usa arriba.
    const latestByAnalyte = new Map<string, (typeof analytes)[number]>();
    for (const analyte of analytes) {
      latestByAnalyte.set(analyte.analyteName, analyte);
    }
    const sex = patient.sexAtBirth === "F" ? "F" : "M";
    return Promise.all(
      [...latestByAnalyte.values()]
        .sort((a, b) => b.measuredAt.getTime() - a.measuredAt.getTime())
        .map(async (analyte) => {
          const ageYears = (analyte.measuredAt.getTime() - patient.birthDate.getTime()) / MS_PER_YEAR;
          const printedRange =
            analyte.referenceMin !== null && analyte.referenceMax !== null
              ? { min: Number(analyte.referenceMin), max: Number(analyte.referenceMax) }
              : null;
          // Capa 2 (M10-RN-008), NUNCA el modelo — el bloque de
          // contexto solo lleva el estado ya decidido por el servidor.
          const evaluation = await this.labReferenceRanges.evaluateForAnalyte(analyte.analyteName, Number(analyte.value), sex, ageYears, printedRange);
          return {
            analito: analyte.analyteName,
            valor: analyte.value.toString(),
            unidad: analyte.unit,
            rangoMin: analyte.referenceMin?.toString() ?? null,
            rangoMax: analyte.referenceMax?.toString() ?? null,
            fecha: analyte.measuredAt.toISOString(),
            estado: evaluation.status,
          };
        })
    );
  }

  // Tendencia: los últimos signos vitales FIRMADOS (vital_sign_sets),
  // con las marcas de rango que el servidor congeló al firmar.
  private async buildSignosVitalesPreviosBlock(patientId: string): Promise<AssistantPreviousVitalsBlock[]> {
    const sets = await this.prisma.vitalSignSet.findMany({
      where: { patientId },
      orderBy: { recordedAt: "desc" },
      take: PREVIOUS_VITALS_COUNT,
    });
    return sets.map((set) => ({
      fecha: set.recordedAt.toISOString(),
      ...omitUndefined({
        presionSistolicaMmHg: set.bpSystolicMmHg ?? undefined,
        presionDiastolicaMmHg: set.bpDiastolicMmHg ?? undefined,
        frecuenciaCardiacaLpm: set.heartRateBpm ?? undefined,
        frecuenciaRespiratoriaRpm: set.respiratoryRateBpm ?? undefined,
        temperaturaC: decimalToNumber(set.temperatureC),
        spo2Porcentaje: set.spo2Percent ?? undefined,
        glucosaCapilarMgDl: set.glucoseCapMgDl ?? undefined,
        llenadoCapilarSegundos: decimalToNumber(set.capillaryRefillSeconds),
        pesoKg: decimalToNumber(set.weightKg),
        tallaCm: decimalToNumber(set.heightCm),
        perimetroCefalicoCm: decimalToNumber(set.headCircumferenceCm),
        perimetroAbdominalCm: decimalToNumber(set.abdominalCircumferenceCm),
        imc: decimalToNumber(set.bmi),
        superficieCorporalM2: decimalToNumber(set.bsaM2),
      }),
      fueraDeRango: set.outOfRangeFlags,
      criticos: set.criticalFlags,
    }));
  }

  private async buildTrayectoriaBlock(patientId: string): Promise<AssistantTrajectoryNoteBlock[]> {
    const threads = await this.patientClinical.notesTimeline(patientId, {});
    return threads.slice(0, TRAJECTORY_NOTE_COUNT).map((thread) => ({
      fecha: (thread.signedAt as Date).toISOString(),
      tipoConsulta: thread.encounterType,
      motivoConsulta: thread.note.chiefComplaint,
      valoracion: thread.note.assessment,
      plan: thread.note.plan,
    }));
  }

  // Escalas de especialidad tal como las guardó el autoguardado
  // ({fieldKey: {value, interpretation?}}), con la etiqueta legible
  // del esquema publicado — "glasgow_ocular" no le dice nada al modelo.
  private async buildEscalasBlock(specialtyData: unknown): Promise<AssistantScaleBlock[]> {
    const entries = Object.entries(asRecord(specialtyData)).flatMap(([key, entry]) => {
      const scale = asRecord(entry);
      return typeof scale.value === "number"
        ? [{ key, value: scale.value, interpretation: typeof scale.interpretation === "string" ? scale.interpretation : null }]
        : [];
    });
    if (entries.length === 0) return [];
    const fields = await this.prisma.specialtyFieldSchema.findMany({
      where: { fieldKey: { in: entries.map((e) => e.key) } },
      select: { fieldKey: true, label: true },
    });
    const labelByKey = new Map(fields.map((f) => [f.fieldKey, f.label]));
    return entries.map((e) => ({ escala: labelByKey.get(e.key) ?? e.key, valor: e.value, interpretacion: e.interpretation }));
  }

  private async buildSintomasAlarmaBlock(termIds: unknown): Promise<string[]> {
    const ids = Array.isArray(termIds) ? termIds.filter((id): id is string => typeof id === "string") : [];
    if (ids.length === 0) return [];
    const terms = await this.prisma.clinicalCatalogTerm.findMany({ where: { id: { in: ids } }, select: { preferredTerm: true } });
    return terms.map((term) => term.preferredTerm);
  }

  // Mientras la nota está en borrador, los diagnósticos viven en
  // draftContent.diagnoses (autoguardado); al firmar pasan a
  // encounter_diagnoses. Se toman de donde estén.
  private async buildDiagnosticosConsultaBlock(encounterId: string, draftDiagnoses: unknown): Promise<AssistantEncounterDiagnosisBlock[]> {
    const fromDraft = Array.isArray(draftDiagnoses) ? draftDiagnoses.map(asRecord).filter((d) => typeof d.description === "string") : [];
    if (fromDraft.length > 0) {
      return fromDraft.map((d) => ({
        codigoIcd10: typeof d.icd10Code === "string" ? d.icd10Code : null,
        descripcion: d.description as string,
        tipo: String(d.diagnosisType ?? ""),
        certeza: String(d.certainty ?? ""),
      }));
    }
    const rows = await this.prisma.encounterDiagnosis.findMany({
      where: { encounterId, discardedAt: null },
      select: { icd10Code: true, description: true, diagnosisType: true, certainty: true },
    });
    return rows.map((row) => ({ codigoIcd10: row.icd10Code, descripcion: row.description, tipo: row.diagnosisType, certeza: row.certainty }));
  }

  private async buildBanderasRojasBlock(encounterId: string): Promise<AssistantRedFlagBlock[]> {
    const events = await this.prisma.redFlagEvent.findMany({
      where: { encounterId },
      orderBy: { detectedAt: "asc" },
      select: { finding: true, urgency: true },
    });
    return events.map((event) => ({ hallazgo: event.finding, urgencia: event.urgency }));
  }

  // Lo que el médico ya emitió en ESTA consulta (canceladas fuera):
  // sin esto el modelo sugiere estudios o tratamientos ya indicados.
  private async buildDocumentosConsultaBlock(encounterId: string): Promise<AssistantEncounterDocumentsBlock> {
    const [prescriptions, labOrders] = await Promise.all([
      this.prisma.prescription.findMany({
        where: { encounterId, cancellation: { is: null } },
        select: { items: { select: { genericName: true, dose: true, route: true, frequency: true, duration: true } } },
      }),
      this.prisma.labOrder.findMany({
        where: { encounterId, cancellation: { is: null } },
        select: { clinicalIndication: true, items: { select: { studyName: true } } },
      }),
    ]);
    return {
      recetas: prescriptions.flatMap((rx) =>
        rx.items.map((item) => ({ medicamento: item.genericName, dosis: item.dose, via: item.route, frecuencia: item.frequency, duracion: item.duration }))
      ),
      ordenesEstudio: labOrders.flatMap((order) => order.items.map((item) => ({ estudio: item.studyName, indicacion: order.clinicalIndication }))),
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function decimalToString(value: Decimalish): string | null {
  return value === null ? null : value.toString();
}

function decimalToNumber(value: Decimalish): number | undefined {
  return value === null ? undefined : Number(value.toString());
}

function buildCurrentNoteBlock(draft: Record<string, unknown>): AssistantCurrentNoteBlock {
  const asString = (key: string): string | undefined => (typeof draft[key] === "string" ? draft[key] : undefined);
  return omitUndefined({
    motivoConsulta: asString("chiefComplaint"),
    padecimientoActual: asString("currentIllness"),
    exploracionFisica: asString("physicalExam"),
    valoracion: asString("assessment"),
    plan: asString("plan"),
    pronostico: asString("prognosis"),
    indicacionesPaciente: asString("patientInstructions"),
    proximaCitaDias: typeof draft.suggestedFollowUpDays === "number" ? draft.suggestedFollowUpDays : undefined,
  });
}

// draftContent.vitals: mismas claves que vitalsSchema, con el IMC ya
// calculado por el autoguardado (withComputedVitals). La superficie
// corporal y las marcas de rango se calculan aquí con las mismas
// funciones que usa la firma — nunca las decide el modelo.
function buildCurrentVitalsBlock(rawVitals: unknown, ageYears: number): AssistantVitalsBlock {
  const raw = asRecord(rawVitals);
  const num = (key: string): number | undefined => (typeof raw[key] === "number" ? raw[key] : undefined);
  const vitals = {
    bpSystolic: num("bpSystolic"),
    bpDiastolic: num("bpDiastolic"),
    heartRate: num("heartRate"),
    respiratoryRate: num("respiratoryRate"),
    tempC: num("tempC"),
    spo2: num("spo2"),
  };
  const withBsa = withBodySurfaceArea({ weightKg: num("weightKg"), heightCm: num("heightCm") });
  const flags = evaluateVitalRanges(ageYears, vitals);
  return {
    ...omitUndefined({
      presionSistolicaMmHg: vitals.bpSystolic,
      presionDiastolicaMmHg: vitals.bpDiastolic,
      frecuenciaCardiacaLpm: vitals.heartRate,
      frecuenciaRespiratoriaRpm: vitals.respiratoryRate,
      temperaturaC: vitals.tempC,
      spo2Porcentaje: vitals.spo2,
      glucosaCapilarMgDl: num("glucoseCapMgDl"),
      llenadoCapilarSegundos: num("capillaryRefillSeconds"),
      pesoKg: num("weightKg"),
      tallaCm: num("heightCm"),
      perimetroCefalicoCm: num("headCircumferenceCm"),
      perimetroAbdominalCm: num("abdominalCircumferenceCm"),
      imc: num("bmi"),
      superficieCorporalM2: withBsa.bsaM2,
    }),
    fueraDeRango: flags.outOfRange,
    criticos: flags.critical,
  };
}

function hashContext(context: AssembledAssistantContext): string {
  return createHash("sha256").update(JSON.stringify(context)).digest("hex");
}
