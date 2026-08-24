import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  ClinicalEncounterCreateInput,
  ClinicalNoteDraftUpdateInput,
  ClinicalNoteSignInput,
} from "@medicfy/contracts";
import { ApiException } from "../../../common/api-exception";
import { PrismaService } from "../../../prisma/prisma.service";
import { sha256Hex } from "../../../common/content-hash.util";
import { omitUndefined } from "../../../common/omit-undefined";
import { AppointmentStateMachineService } from "../../scheduling/services/appointment-state-machine.service";

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
    private readonly appointments: AppointmentStateMachineService
  ) {}

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
    const draftContent = { ...(encounter.draftContent as Record<string, unknown>), ...patch };
    return this.prisma.clinicalEncounter.update({
      where: { id: encounterId },
      data: { draftContent },
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

    const { diagnoses, physicalExam, prognosis, ...requiredNote } = input;
    const noteContent = { ...requiredNote, physicalExam, prognosis };
    const contentHashSha256 = sha256Hex({ noteContent, diagnoses, previousHashSha256, encounterId });
    const signedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const note = await tx.clinicalNote.create({
        data: { encounterId, ...requiredNote, ...omitUndefined({ physicalExam, prognosis }) },
      });
      if (diagnoses.length > 0) {
        await tx.encounterDiagnosis.createMany({
          data: diagnoses.map((d) => ({ encounterId, ...d })),
        });
      }
      const updated = await tx.clinicalEncounter.update({
        where: { id: encounterId },
        data: {
          status: "SIGNED",
          endedAt: signedAt,
          signedAt,
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
