import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  ClinicalEncounterCreateInput,
  ClinicalNoteCorrectionInput,
  ClinicalNoteDraftUpdateInput,
  ClinicalNoteSignInput,
} from "@medicfy/contracts";
import { ApiException } from "../../../common/api-exception";
import { PrismaService } from "../../../prisma/prisma.service";
import { sha256Hex } from "../../../common/content-hash.util";
import { omitUndefined } from "../../../common/omit-undefined";
import { withComputedVitals } from "../../../common/vitals-calculations.util";
import { AppointmentStateMachineService } from "../../scheduling/services/appointment-state-machine.service";
import { SpecialtyScaleService } from "./specialty-scale.service";

const ABANDONED_AFTER_HOURS = 72;

// M8: contenedor del encuentro (DRAFT autoguardado libremente) + su
// nota NOM-004 (congelada al firmar). ClinicalNote no está en la
// lista literal de R1 salvo cuando ya está firmada — mientras está en
// DRAFT es una fila mutable normal; el GRANT de Postgres de todos
// modos ya bloquea UPDATE sobre clinical_notes para medicfy_app
// siempre (ver migración), así que el autoguardado en realidad
// escribe sobre la fila vía un patrón distinto: el draft vive en
// ClinicalEncounter hasta firmar, y ClinicalNote se INSERTA una sola
// vez, ya completa, en el momento de firmar — no antes. Esto es más
// simple que intentar reconciliar "autoguardado" con una tabla que la
// base de datos ya hace verdaderamente append-only, y sigue
// cumpliendo M8-RN-002 (el frontend autoguarda hacia el ENCOUNTER,
// editable, y solo al firmar se materializa la nota).
@Injectable()
export class ClinicalEncounterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentStateMachineService,
    private readonly scales: SpecialtyScaleService
  ) {}

  // Resuelve la especialidad del médico dueño del encuentro y computa
  // specialtyData contra sus SpecialtyFieldSchema activos (ESCALAS).
  // undefined si no vino specialtyData en el patch/input — firmar sin
  // mandarlo sigue funcionando exactamente igual que antes de esto.
  // version viaja junto con data porque EncounterSpecialtyData debe
  // fijar la versión de los campos REALMENTE usados para este cálculo
  // (M8-RN-014: "si cambia una guía, las notas viejas conservan su
  // cálculo"), no cualquier versión de ESCALAS que exista hoy.
  private async resolveSpecialtyData(
    doctorId: string,
    rawSpecialtyData: Record<string, number> | undefined
  ): Promise<{ version: number; data: Record<string, unknown> } | undefined> {
    if (!rawSpecialtyData) return undefined;
    const doctor = await this.prisma.doctor.findUniqueOrThrow({ where: { id: doctorId } });
    const fields = await this.scales.listActiveFields(doctor.primarySpecialtyId, "ESCALAS");
    return { version: fields[0]?.version ?? 1, data: this.scales.computeAndValidate(fields, rawSpecialtyData) };
  }

  // appointmentId es @unique en ClinicalEncounter (a propósito: una
  // cita, un encounter). /consulta/[appointmentId] puede disparar dos
  // solicitudes de creación casi simultáneas para la misma cita (dos
  // pestañas, un doble clic, o el doble-montaje de efectos de React
  // en desarrollo) — en vez de dejar que la segunda reviente con un
  // 500 de violación de constraint, se trata como el resultado
  // correcto sería de todos modos: devolver el encounter que la
  // primera solicitud ya creó (mismo principio de idempotencia que
  // CLAUDE.md §4 exige para citas/recetas/pagos).
  async create(patientId: string, doctorId: string, input: ClinicalEncounterCreateInput) {
    if (input.patientId !== patientId) {
      throw new ApiException("VALIDATION_ERROR", "El paciente de la ruta no coincide con el del cuerpo.", HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.prisma.clinicalEncounter.create({
        data: {
          patientId,
          doctorId,
          encounterType: input.encounterType,
          ...omitUndefined({ appointmentId: input.appointmentId }),
          draftContent: {},
        },
      });
    } catch (error) {
      if (input.appointmentId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await this.prisma.clinicalEncounter.findUnique({ where: { appointmentId: input.appointmentId } });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async listForPatient(patientId: string) {
    return this.prisma.clinicalEncounter.findMany({
      where: { patientId },
      orderBy: { startedAt: "desc" },
      include: { notes: true, diagnoses: true },
    });
  }

  async getById(encounterId: string) {
    const encounter = await this.prisma.clinicalEncounter.findUnique({
      where: { id: encounterId },
      include: { notes: true, diagnoses: true },
    });
    if (!encounter) {
      throw new ApiException("ENCOUNTER_NOT_FOUND", "Encuentro no encontrado.", HttpStatus.NOT_FOUND);
    }
    return encounter;
  }

  // M8-RN-002: autoguardado cada 10s mientras DRAFT. Se guarda en el
  // propio encounter (draftContent JSON), no en clinical_notes — ver
  // nota de cabecera.
  async updateDraft(encounterId: string, patch: ClinicalNoteDraftUpdateInput) {
    const encounter = await this.assertDraft(encounterId);
    // IMC/escalas en vivo mientras se escribe — sign() vuelve a
    // calcularlos de forma autoritativa a partir de los valores
    // finales, nunca confía en lo que quedó guardado aquí.
    const resolvedSpecialtyData = await this.resolveSpecialtyData(encounter.doctorId, patch.specialtyData);
    const nextPatch = {
      ...patch,
      ...(patch.vitals ? { vitals: withComputedVitals(patch.vitals) } : {}),
      ...(resolvedSpecialtyData ? { specialtyData: resolvedSpecialtyData.data } : {}),
    };
    const draftContent = { ...(encounter.draftContent as Record<string, unknown>), ...nextPatch };
    return this.prisma.clinicalEncounter.update({
      where: { id: encounterId },
      data: { draftContent: draftContent as unknown as Prisma.InputJsonValue },
    });
  }

  // M8-RN-001/M8-RN-002: al firmar se congela — se materializa la
  // única fila de clinical_notes (append-only real vía GRANT) con el
  // contenido final, se calcula el hash y se encadena con el último
  // encuentro firmado del mismo paciente (M8-CA-004).
  async sign(encounterId: string, doctorUserId: string, input: ClinicalNoteSignInput) {
    const encounter = await this.assertDraft(encounterId);

    const previous = await this.prisma.clinicalEncounter.findFirst({
      where: { patientId: encounter.patientId, status: "SIGNED", id: { not: encounterId } },
      orderBy: { signedAt: "desc" },
      select: { contentHashSha256: true },
    });
    const previousHashSha256 = previous?.contentHashSha256 ?? null;

    const { diagnoses, physicalExam, prognosis, vitals, specialtyData: rawSpecialtyData, ...requiredNote } = input;
    // Autoritativo: el IMC y las escalas finales se calculan aquí
    // sobre lo que de verdad se firma, no sobre lo que haya quedado en
    // el draft — y ambos entran al hash, protegidos igual que el resto
    // del contenido de la nota.
    const computedVitals = withComputedVitals(vitals);
    const resolvedSpecialtyData = await this.resolveSpecialtyData(encounter.doctorId, rawSpecialtyData);
    const noteContent = { ...requiredNote, vitals: computedVitals, physicalExam, prognosis };
    const contentHashSha256 = sha256Hex({ noteContent, diagnoses, specialtyData: resolvedSpecialtyData?.data, previousHashSha256, encounterId });
    const signedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const note = await tx.clinicalNote.create({
        data: { encounterId, ...requiredNote, vitals: computedVitals, ...omitUndefined({ physicalExam, prognosis }) },
      });
      if (diagnoses.length > 0) {
        // omitUndefined: icd10Code/codeAbsentReason son mutuamente
        // opcionales (segunda ruta de M8-RN-006, ver
        // encounterDiagnosisSchema) — el que no venga debe omitirse,
        // no mandarse como `undefined` explícito.
        await tx.encounterDiagnosis.createMany({
          data: diagnoses.map(({ icd10Code, codeAbsentReason, ...required }) => ({
            encounterId,
            ...required,
            ...omitUndefined({ icd10Code, codeAbsentReason }),
          })),
        });
      }
      if (resolvedSpecialtyData && Object.keys(resolvedSpecialtyData.data).length > 0) {
        await tx.encounterSpecialtyData.create({
          data: {
            encounterId,
            specialtySchemaVersion: resolvedSpecialtyData.version,
            data: resolvedSpecialtyData.data as unknown as Prisma.InputJsonValue,
          },
        });
      }
      const updated = await tx.clinicalEncounter.update({
        where: { id: encounterId },
        data: {
          status: "SIGNED",
          endedAt: signedAt,
          signedAt,
          // M8-RN-013: la métrica del negocio, fijada en servidor.
          timeToSignSeconds: Math.max(0, Math.round((signedAt.getTime() - encounter.startedAt.getTime()) / 1000)),
          signedByUserId: doctorUserId,
          signatureMethod: "INTERNAL_SYSTEM",
          contentHashSha256,
          previousHashSha256,
        },
      });
      return { encounter: updated, note };
    });
  }

  // M5-RN-006/schema.prisma: "cuando M8 exista, la ruta real [a
  // completed] se vuelve la primaria". Se hace fuera de la
  // transacción de arriba a propósito: la firma de la nota (protegida
  // por R1/GRANT) es lo legalmente crítico y ya quedó comprometida en
  // disco; el estado de la cita es una conveniencia de agenda —
  // completeWithSignedNote() ya absorbe silenciosamente el caso en
  // que la cita no esté en IN_PROGRESS, así que esto nunca debe hacer
  // que sign() falle después de haber firmado con éxito.
  async signAndCompleteAppointment(encounterId: string, doctorUserId: string, input: ClinicalNoteSignInput) {
    const result = await this.sign(encounterId, doctorUserId, input);
    if (result.encounter.appointmentId) {
      await this.appointments.completeWithSignedNote(result.encounter.appointmentId, doctorUserId);
    }
    return result;
  }

  // M8-RN-001: "corregir = nota nueva con isCorrectionOfNoteId, nunca
  // UPDATE" — el modelo y el contrato (clinicalNoteCorrectionSchema)
  // ya existían desde que se construyó M8; esto es lo que faltaba
  // conectar. Reusa exactamente el mismo patrón de creación de
  // note+diagnoses que sign(), sobre un encounter que YA está SIGNED
  // (nunca lo vuelve a tocar: el encounter no se re-firma, solo gana
  // una nota más en su lista). Limitación heredada del esquema, no
  // introducida aquí: EncounterDiagnosis solo referencia encounterId,
  // no noteId — los diagnósticos de una corrección se suman a los
  // del encounter, no reemplazan a los de la nota original en la
  // base de datos (la interfaz decide cómo mostrarlo).
  async correctNote(encounterId: string, doctorUserId: string, input: ClinicalNoteCorrectionInput) {
    const encounter = await this.prisma.clinicalEncounter.findUnique({ where: { id: encounterId } });
    if (!encounter) {
      throw new ApiException("ENCOUNTER_NOT_FOUND", "Encuentro no encontrado.", HttpStatus.NOT_FOUND);
    }
    if (encounter.status !== "SIGNED") {
      throw new ApiException(
        "ENCOUNTER_NOT_SIGNED",
        "Solo se puede corregir un encuentro ya firmado. Un borrador se edita directamente.",
        HttpStatus.CONFLICT
      );
    }
    const original = await this.prisma.clinicalNote.findUnique({ where: { id: input.isCorrectionOfNoteId } });
    if (!original || original.encounterId !== encounterId) {
      throw new ApiException(
        "NOTE_NOT_FOUND",
        "La nota que se intenta corregir no existe o no pertenece a este encuentro.",
        HttpStatus.NOT_FOUND
      );
    }

    const { diagnoses, physicalExam, prognosis, vitals, isCorrectionOfNoteId, ...requiredNote } = input;
    const computedVitals = withComputedVitals(vitals);

    return this.prisma.$transaction(async (tx) => {
      const note = await tx.clinicalNote.create({
        data: {
          encounterId,
          isCorrectionOfNoteId,
          ...requiredNote,
          vitals: computedVitals,
          ...omitUndefined({ physicalExam, prognosis }),
        },
      });
      if (diagnoses.length > 0) {
        await tx.encounterDiagnosis.createMany({
          data: diagnoses.map(({ icd10Code, codeAbsentReason, ...required }) => ({
            encounterId,
            ...required,
            ...omitUndefined({ icd10Code, codeAbsentReason }),
          })),
        });
      }
      return note;
    });
  }

  // M8-RN-003: un draft sin firmar >72h se marca abandonado —
  // evaluado en el momento del acceso, sin scheduler (mismo patrón
  // que CareRelationship/PatientGuardian).
  private async assertDraft(encounterId: string) {
    const encounter = await this.prisma.clinicalEncounter.findUnique({ where: { id: encounterId } });
    if (!encounter) {
      throw new ApiException("ENCOUNTER_NOT_FOUND", "Encuentro no encontrado.", HttpStatus.NOT_FOUND);
    }
    if (encounter.status !== "DRAFT") {
      throw new ApiException("ENCOUNTER_ALREADY_SIGNED", "Este encuentro ya fue firmado y no se puede modificar.", HttpStatus.CONFLICT);
    }
    const ageHours = (Date.now() - encounter.startedAt.getTime()) / (1000 * 60 * 60);
    if (ageHours > ABANDONED_AFTER_HOURS && !encounter.abandonedAt) {
      await this.prisma.clinicalEncounter.update({ where: { id: encounterId }, data: { abandonedAt: new Date() } });
      throw new ApiException(
        "ENCOUNTER_ABANDONED",
        "Este borrador lleva más de 72 horas sin firmarse y se marcó como abandonado.",
        HttpStatus.CONFLICT
      );
    }
    return encounter;
  }
}
