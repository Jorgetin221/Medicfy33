import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { calculateAge } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { PatientClinicalService } from "../../records/services/patient-clinical.service";
import { LabResultAnalyteService } from "../../labs/services/lab-result-analyte.service";
import { omitUndefined } from "../../../common/omit-undefined";
import type {
  AssembledAssistantContext,
  AssembledAssistantContextResult,
  AssistantAllergyBlock,
  AssistantCurrentContext,
  AssistantCurrentNoteBlock,
  AssistantEncuadreBlock,
  AssistantHistoryBlock,
  AssistantLabBlock,
  AssistantMedicationBlock,
  AssistantPatientBlock,
  AssistantProblemBlock,
  AssistantStableContext,
  AssistantTrajectoryNoteBlock,
} from "../assistant-context.types";

// Fase 8 · Prompt 50 (docs/medicfy-58-prompts.md, Bloque 9). "Se arma
// en el servidor, campo por campo, a partir de datos estructurados.
// NUNCA se manda el expediente completo." Cada bloque privado de abajo
// hace su propia consulta con SELECT explícito (o reusa un método de
// PatientClinicalService/LabResultAnalyteService que tampoco toca
// columnas de identidad) — la SEUDONIMIZACIÓN no es un paso de
// "limpieza" al final, es que estas consultas simplemente nunca piden
// nombre, apellidos, CURP, domicilio, teléfono, correo ni folio
// (medicfyId). Edad y sexo sí se conservan (cambian el razonamiento
// clínico; la identidad no aporta nada al diferencial).
const TRAJECTORY_NOTE_COUNT = 3;

@Injectable()
export class ContextAssemblerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientClinical: PatientClinicalService,
    private readonly labResultAnalytes: LabResultAnalyteService
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
    const [paciente, seguridad, problemas, medicacion, antecedentes, laboratorio, trayectoria] = await Promise.all([
      this.buildPacienteBlock(patientId),
      this.buildSeguridadBlock(patientId),
      this.buildProblemasBlock(patientId),
      this.buildMedicacionBlock(patientId),
      this.buildAntecedentesBlock(patientId),
      this.buildLaboratorioBlock(patientId),
      this.buildTrayectoriaBlock(patientId),
    ]);
    return { paciente, seguridad, problemas, medicacion, antecedentes, laboratorio, trayectoria };
  }

  async assembleCurrentBlock(encounterId: string): Promise<AssistantCurrentContext> {
    const encounter = await this.prisma.clinicalEncounter.findUniqueOrThrow({
      where: { id: encounterId },
      select: { encounterType: true, draftContent: true, doctorId: true },
    });
    const doctor = await this.prisma.doctor.findUniqueOrThrow({
      where: { id: encounter.doctorId },
      select: { primarySpecialty: { select: { nameEs: true } } },
    });
    const encuadre: AssistantEncuadreBlock = {
      especialidad: doctor.primarySpecialty?.nameEs ?? null,
      tipoConsulta: encounter.encounterType,
    };
    return { actual: buildCurrentNoteBlock(encounter.draftContent), encuadre };
  }

  private async buildPacienteBlock(patientId: string): Promise<AssistantPatientBlock> {
    const patient = await this.prisma.patient.findUniqueOrThrow({
      where: { id: patientId },
      select: { birthDate: true, sexAtBirth: true },
    });
    const pregnancy = await this.patientClinical.getActivePregnancy(patientId);
    return {
      edadAnios: calculateAge(patient.birthDate),
      sexo: patient.sexAtBirth,
      embarazo: pregnancy
        ? { semanasGestacion: pregnancy.gestationalAge.weeks, diasGestacion: pregnancy.gestationalAge.days }
        : null,
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
      .filter((item) => item.status === "PRESENTE")
      .map((item) => ({
        categoria: item.category,
        subtipo: item.subtype,
        parentesco: item.familyRelationship !== "NONE" ? item.familyRelationship : null,
        comentario: item.freeText ?? null,
      }));
  }

  private async buildLaboratorioBlock(patientId: string): Promise<AssistantLabBlock[]> {
    const analytes = await this.labResultAnalytes.listForPatient(patientId);
    // "últimos analitos": un valor por analito (el más reciente), no
    // el historial completo — mismo criterio de "agrupar y quedarse
    // con lo último" que activeDiagnoses ya usa arriba.
    const latestByAnalyte = new Map<string, (typeof analytes)[number]>();
    for (const analyte of analytes) {
      latestByAnalyte.set(analyte.analyteName, analyte);
    }
    return [...latestByAnalyte.values()]
      .sort((a, b) => b.measuredAt.getTime() - a.measuredAt.getTime())
      .map((analyte) => ({
        analito: analyte.analyteName,
        valor: analyte.value.toString(),
        unidad: analyte.unit,
        rangoMin: analyte.referenceMin?.toString() ?? null,
        rangoMax: analyte.referenceMax?.toString() ?? null,
        fecha: analyte.measuredAt.toISOString(),
      }));
  }

  private async buildTrayectoriaBlock(patientId: string): Promise<AssistantTrajectoryNoteBlock[]> {
    const threads = await this.patientClinical.notesTimeline(patientId, {});
    return threads.slice(0, TRAJECTORY_NOTE_COUNT).map((thread) => ({
      fecha: (thread.signedAt as Date).toISOString(),
      tipoConsulta: thread.encounterType,
      motivoConsulta: thread.note.chiefComplaint,
      valoracion: thread.note.assessment,
    }));
  }
}

function buildCurrentNoteBlock(draftContent: unknown): AssistantCurrentNoteBlock {
  const draft = (draftContent ?? {}) as Record<string, unknown>;
  const asString = (key: string): string | undefined => (typeof draft[key] === "string" ? (draft[key] as string) : undefined);
  return omitUndefined({
    motivoConsulta: asString("chiefComplaint"),
    padecimientoActual: asString("currentIllness"),
    exploracionFisica: asString("physicalExam"),
    valoracion: asString("assessment"),
    plan: asString("plan"),
    pronostico: asString("prognosis"),
  });
}

function hashContext(context: AssembledAssistantContext): string {
  return createHash("sha256").update(JSON.stringify(context)).digest("hex");
}
