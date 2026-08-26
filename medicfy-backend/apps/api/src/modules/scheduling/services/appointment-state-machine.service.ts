import { HttpStatus, Injectable } from "@nestjs/common";
import type { Appointment, AppointmentCreatedVia, AppointmentStatus, Prisma } from "@prisma/client";
import type { AppointmentCreateInput } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { modalityForServiceType } from "../service-modality";
import { todayInTimeZone, zonedDateAndMinutesToUtc } from "../timezone";
import { CareRelationshipService } from "./care-relationship.service";
import { DEFAULT_CANCELLATION_POLICY, resolveCancellationPolicy, refundPercentFor, type CancellationPolicy } from "../cancellation-policy";

const PAYMENT_WINDOW_MINUTES = 30;
const NO_SHOW_GRACE_MINUTES = 60;
const MAX_RESCHEDULES = 2;

export type CancellingRole = "DOCTOR" | "PATIENT";

// §7 M5 "Máquina de estados — ninguna transición fuera de esta tabla
// es válida." Transcrita literalmente del diagrama de la spec.
const VALID_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  PENDING_PAYMENT: ["SCHEDULED", "CANCELLED_BY_PATIENT"],
  SCHEDULED: ["CONFIRMED", "IN_PROGRESS", "CANCELLED_BY_PATIENT", "CANCELLED_BY_DOCTOR", "NO_SHOW"],
  CONFIRMED: ["IN_PROGRESS", "CANCELLED_BY_PATIENT", "CANCELLED_BY_DOCTOR", "NO_SHOW"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED_BY_PATIENT: [],
  CANCELLED_BY_DOCTOR: [],
  NO_SHOW: [],
};

// Postgres SQLSTATE 23P01 = exclusion_violation, the
// appointments_no_overlap constraint from the M5a migration firing.
// Prisma doesn't model EXCLUDE constraints natively, so it surfaces
// as a raw driver error rather than one of Prisma's own P2xxx codes —
// checked broadly (code, message, and nested cause) rather than
// assuming one exact shape, verified empirically against a real
// violation while building this (see m5a.integration.spec.ts).
function isExclusionViolation(error: unknown): boolean {
  const asRecord = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" ? (value as Record<string, unknown>) : null);
  let current = asRecord(error);
  for (let depth = 0; current && depth < 5; depth++) {
    if (current.code === "23P01") return true;
    const message = typeof current.message === "string" ? current.message : "";
    if (message.includes("23P01") || message.toLowerCase().includes("exclusion")) return true;
    current = asRecord(current.cause) ?? asRecord(current.meta);
  }
  return false;
}

@Injectable()
export class AppointmentStateMachineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly careRelationshipService: CareRelationshipService
  ) {}

  // M4-CA-001: la única fuente de verdad de "este espacio ya está
  // tomado" es la restricción EXCLUDE de la base de datos, no un
  // chequeo previo en la aplicación (que siempre pierde la carrera
  // bajo concurrencia real — ver la nota técnica de §6.4). Se
  // intenta el INSERT directamente y se traduce la violación en
  // SLOT_TAKEN.
  async create(actingDoctorId: string, actorUserId: string, createdVia: AppointmentCreatedVia, input: AppointmentCreateInput): Promise<Appointment> {
    const service = await this.prisma.doctorService.findFirst({
      where: { id: input.serviceId, doctorId: actingDoctorId, isActive: true },
    });
    if (!service) {
      throw new ApiException("SERVICE_NOT_FOUND", "Servicio no encontrado para este médico.", HttpStatus.NOT_FOUND);
    }

    const patient = await this.prisma.patient.findUnique({ where: { id: input.patientId } });
    if (!patient) {
      throw new ApiException("PATIENT_NOT_FOUND", "Paciente no encontrado.", HttpStatus.NOT_FOUND);
    }

    const doctor = await this.prisma.doctor.findUniqueOrThrow({ where: { id: actingDoctorId } });

    // M2-RN-004/M2-CA-006: "necesita >=1 consultorio activo o
    // teleconsulta habilitada para recibir citas." DOCTOR_NOT_ACCEPTING_PATIENTS
    // es el código que la spec ya nombra para esto en la tabla de
    // errores de M5 (§7) — no es un código inventado aquí.
    if (!doctor.acceptsTeleconsultation) {
      const activeLocationCount = await this.prisma.practiceLocation.count({
        where: { doctorId: actingDoctorId, isActive: true },
      });
      if (activeLocationCount === 0) {
        throw new ApiException(
          "DOCTOR_NOT_ACCEPTING_PATIENTS",
          "Este médico no tiene consultorio activo ni teleconsulta habilitada.",
          HttpStatus.FORBIDDEN
        );
      }
    }

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
    const earliestAllowed = new Date(Date.now() + doctor.minBookingNoticeMinutes * 60_000);
    const latestAllowed = new Date(Date.now() + doctor.maxBookingWindowDays * 24 * 60 * 60_000);
    if (startsAt < earliestAllowed) {
      throw new ApiException("SLOT_TOO_SOON", "Este horario no respeta la antelación mínima del médico.", HttpStatus.UNPROCESSABLE_ENTITY);
    }
    if (startsAt > latestAllowed) {
      throw new ApiException(
        "OUTSIDE_BOOKING_WINDOW",
        "Este horario excede la ventana máxima de agenda del médico.",
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }

    const policy = resolveCancellationPolicy(doctor.cancellationPolicy);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const appointment = await tx.appointment.create({
          data: {
            patientId: input.patientId,
            doctorId: actingDoctorId,
            locationId: input.locationId ?? service.locationId ?? null,
            serviceId: input.serviceId,
            modality: modalityForServiceType(service.serviceType),
            startsAt,
            endsAt,
            status: "PENDING_PAYMENT",
            createdByUserId: actorUserId,
            createdVia,
            priceMxnCents: service.priceMxnCents,
            paymentDeadlineAt: new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60_000),
            cancellationPolicySnapshot: policy as unknown as Prisma.InputJsonValue,
          },
        });

        await tx.appointmentStatusHistory.create({
          data: { appointmentId: appointment.id, fromStatus: null, toStatus: "PENDING_PAYMENT", changedByUserId: actorUserId },
        });

        await this.careRelationshipService.createOrRenew(input.patientId, actingDoctorId, "APPOINTMENT", tx);

        return appointment;
      });
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new ApiException("SLOT_TAKEN", "Este horario ya no está disponible.", HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  async findById(appointmentId: string): Promise<Appointment> {
    const appointment = await this.prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment) {
      throw new ApiException("APPOINTMENT_NOT_FOUND", "Cita no encontrada.", HttpStatus.NOT_FOUND);
    }
    return appointment;
  }

  // /consulta/[appointmentId] (DOC-06): necesita nombre/edad del
  // paciente y si ya existe un encounter ligado, sin que el frontend
  // tenga que resolverlo con llamadas separadas. Método aparte de
  // findById (no se le agregan includes) porque assertOwnedByCaller
  // lo usa en cada acción de la máquina de estados y no necesita
  // estos joins.
  async findByIdWithDetails(appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: {
          select: { firstName: true, lastNamePaternal: true, lastNameMaternal: true, medicfyId: true, birthDate: true, sexAtBirth: true },
        },
        service: { select: { name: true, durationMinutes: true } },
        encounter: { select: { id: true, status: true, encounterType: true } },
      },
    });
    if (!appointment) {
      throw new ApiException("APPOINTMENT_NOT_FOUND", "Cita no encontrada.", HttpStatus.NOT_FOUND);
    }
    return appointment;
  }

  // DOC-01 "agenda del día": sin `dateStr`, el día es "hoy en
  // America/Mexico_City" — calculado aquí, no en el navegador
  // (CLAUDE.md §4). Incluye nombre de paciente y servicio porque una
  // agenda con solo IDs no es una agenda; sin esto la pantalla no se
  // podía construir sin N+1 fetches desde el cliente.
  async listForDoctor(doctorId: string, dateStr?: string) {
    const day = dateStr ?? todayInTimeZone();
    const startOfDay = zonedDateAndMinutesToUtc(day, 0);
    const endOfDay = zonedDateAndMinutesToUtc(day, 24 * 60);
    return this.prisma.appointment.findMany({
      where: { doctorId, startsAt: { gte: startOfDay, lt: endOfDay } },
      orderBy: { startsAt: "asc" },
      include: {
        patient: { select: { firstName: true, lastNamePaternal: true, lastNameMaternal: true, medicfyId: true } },
        service: { select: { name: true, durationMinutes: true } },
      },
    });
  }

  // Diagrama de §7 M5: "pending_payment ──pago confirmado──> scheduled".
  // Sin M6 (billing) todavía no existe un webhook real de proveedor de
  // pago que dispare esto — seam público y testeable para cuando
  // POST /webhooks/{provider} (M6, §8.1) exista, en vez de un método
  // privado inalcanzable desde fuera del servicio.
  async confirmPayment(appointmentId: string, actorUserId: string | null): Promise<Appointment> {
    return this.transition(appointmentId, "SCHEDULED", actorUserId, "Pago confirmado.");
  }

  async confirm(appointmentId: string, actorUserId: string): Promise<Appointment> {
    return this.transition(appointmentId, "CONFIRMED", actorUserId);
  }

  async start(appointmentId: string, actorUserId: string): Promise<Appointment> {
    return this.transition(appointmentId, "IN_PROGRESS", actorUserId);
  }

  // M5-RN-006: "solo pasa a completed cuando existe una nota clínica
  // firmada... el médico puede cerrar como completed marcando
  // 'consulta sin nota' con justificación." M8 doesn't exist yet, so
  // this exception path is the only path — completedWithoutNoteReason
  // is always populated for now, not conditionally.
  async complete(appointmentId: string, actorUserId: string, justification: string): Promise<Appointment> {
    const updated = await this.transition(appointmentId, "COMPLETED", actorUserId, justification);
    return this.prisma.appointment.update({ where: { id: updated.id }, data: { completedWithoutNoteReason: justification } });
  }

  // M8: "cuando M8 exista, la ruta real [a completed] se vuelve la
  // primaria" (comentario original de completedWithoutNoteReason en
  // schema.prisma) — este es ese camino real, llamado desde
  // ClinicalEncounterService.sign() cuando el encounter firmado tenía
  // una cita ligada. A diferencia de complete(), nunca escribe
  // completedWithoutNoteReason: null ahí ES la señal de "se completó
  // con nota firmada", no un campo vacío por descuido. Silenciosa si
  // la cita ya no está en IN_PROGRESS (p. ej. se canceló en la
  // ventana entre abrir la consulta y firmar) — la nota ya quedó
  // firmada de todos modos, y eso es lo que legalmente importa; no
  // tiene sentido que una firma clínica exitosa falle por un
  // problema de estado de agenda.
  async completeWithSignedNote(appointmentId: string, actorUserId: string): Promise<void> {
    const current = await this.findById(appointmentId);
    if (current.status !== "IN_PROGRESS") return;
    try {
      await this.transition(appointmentId, "COMPLETED", actorUserId, "Nota clínica firmada.");
    } catch (error) {
      if (error instanceof ApiException && error.code === "APPOINTMENT_TRANSITION_INVALID") return;
      throw error;
    }
  }

  async markNoShow(appointmentId: string, actorUserId: string | null): Promise<Appointment> {
    return this.transition(appointmentId, "NO_SHOW", actorUserId, "60 minutos tras hora de fin sin inicio.");
  }

  // M5-RN-002/003: doctor-initiated cancellation is always 100%
  // refund regardless of timing; patient-initiated follows the
  // appointment's own cancellationPolicySnapshot, never the doctor's
  // possibly-since-changed current policy (M5-CA-003).
  async cancel(
    appointmentId: string,
    actorUserId: string,
    cancelledAsRole: CancellingRole,
    reason?: string
  ): Promise<{ appointment: Appointment; refundPercent: number }> {
    const before = await this.findById(appointmentId);
    const toStatus: AppointmentStatus = cancelledAsRole === "DOCTOR" ? "CANCELLED_BY_DOCTOR" : "CANCELLED_BY_PATIENT";

    const updated = await this.transition(appointmentId, toStatus, actorUserId, reason, { cancelledAt: new Date(), cancelledByUserId: actorUserId, cancellationReason: reason ?? null });

    const refundPercent =
      cancelledAsRole === "DOCTOR"
        ? 100
        : refundPercentFor(
            (before.cancellationPolicySnapshot as unknown as CancellationPolicy | null) ?? DEFAULT_CANCELLATION_POLICY,
            new Date(),
            before.startsAt
          );

    return { appointment: updated, refundPercent };
  }

  // M5-RN-004: "Reagenda = cancelación + nueva cita ligada por
  // rescheduled_from_id, conservando el pago." La nueva cita nace en
  // SCHEDULED (no pending_payment) precisamente porque el pago ya
  // estaba confirmado en la original — es la única vía de creación
  // que empieza fuera de pending_payment, y es deliberada, no un
  // atajo alrededor de la máquina de estados.
  async reschedule(appointmentId: string, actorUserId: string, cancelledAsRole: CancellingRole, newStartsAt: string): Promise<Appointment> {
    const current = await this.findById(appointmentId);
    if (!VALID_TRANSITIONS[current.status].includes("CANCELLED_BY_PATIENT") && !VALID_TRANSITIONS[current.status].includes("CANCELLED_BY_DOCTOR")) {
      throw new ApiException("APPOINTMENT_TRANSITION_INVALID", "Esta cita no se puede reagendar en su estado actual.", HttpStatus.CONFLICT);
    }
    if (current.rescheduleCount >= MAX_RESCHEDULES) {
      throw new ApiException("MAX_RESCHEDULES_REACHED", "Esta cita ya alcanzó el máximo de reagendas (2).", HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const service = await this.prisma.doctorService.findUniqueOrThrow({ where: { id: current.serviceId } });
    const startsAt = new Date(newStartsAt);
    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
    const cancelToStatus: AppointmentStatus = cancelledAsRole === "DOCTOR" ? "CANCELLED_BY_DOCTOR" : "CANCELLED_BY_PATIENT";

    try {
      return await this.prisma.$transaction(async (tx) => {
        const cancelResult = await tx.appointment.updateMany({
          where: { id: appointmentId, status: current.status },
          data: { status: cancelToStatus, cancelledAt: new Date(), cancelledByUserId: actorUserId, cancellationReason: "Reagendada" },
        });
        if (cancelResult.count === 0) {
          throw new ApiException("APPOINTMENT_TRANSITION_INVALID", "Esta cita cambió de estado antes de poder reagendarla.", HttpStatus.CONFLICT);
        }
        await tx.appointmentStatusHistory.create({
          data: { appointmentId, fromStatus: current.status, toStatus: cancelToStatus, changedByUserId: actorUserId, reason: "Reagendada" },
        });

        const created = await tx.appointment.create({
          data: {
            patientId: current.patientId,
            doctorId: current.doctorId,
            locationId: current.locationId,
            serviceId: current.serviceId,
            modality: current.modality,
            startsAt,
            endsAt,
            status: "SCHEDULED",
            createdByUserId: actorUserId,
            createdVia: current.createdVia,
            priceMxnCents: current.priceMxnCents,
            cancellationPolicySnapshot: current.cancellationPolicySnapshot as Prisma.InputJsonValue,
            rescheduledFromId: appointmentId,
            rescheduleCount: current.rescheduleCount + 1,
          },
        });
        await tx.appointmentStatusHistory.create({
          data: { appointmentId: created.id, fromStatus: null, toStatus: "SCHEDULED", changedByUserId: actorUserId, reason: `Reagendada desde ${appointmentId}` },
        });

        return created;
      });
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new ApiException("SLOT_TAKEN", "Este horario ya no está disponible.", HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  // M5-CA-002: "Una cita sin pago confirmado libera su espacio a los
  // 30 minutos exactos." Sin scheduler todavía — barrido invocable
  // (mismo patrón que PatientGuardian/CareRelationship), listo para
  // un futuro processor de BullMQ.
  async releaseExpiredPendingPayments(): Promise<number> {
    const expired = await this.prisma.appointment.findMany({
      where: { status: "PENDING_PAYMENT", paymentDeadlineAt: { lt: new Date() } },
    });
    for (const appointment of expired) {
      await this.transition(appointment.id, "CANCELLED_BY_PATIENT", null, "Pago no confirmado en 30 minutos (automático).");
    }
    return expired.length;
  }

  // "60 min tras hora de fin sin inicio" — mismo patrón de barrido.
  async markExpiredAsNoShow(): Promise<number> {
    const cutoff = new Date(Date.now() - NO_SHOW_GRACE_MINUTES * 60_000);
    const candidates = await this.prisma.appointment.findMany({
      where: { status: { in: ["SCHEDULED", "CONFIRMED"] }, endsAt: { lt: cutoff } },
    });
    for (const appointment of candidates) {
      await this.transition(appointment.id, "NO_SHOW", null, "60 minutos tras hora de fin sin inicio (automático).");
    }
    return candidates.length;
  }

  // M5-CA-001: "Toda transición de estado inválida devuelve 409 y no
  // modifica la cita." La condición vive en el WHERE del UPDATE
  // (status = <el que acabamos de leer>), no solo en la validación
  // previa — así una transición concurrente entre la lectura y la
  // escritura también se rechaza (0 filas afectadas), en vez de
  // pisarla en silencio.
  private async transition(
    appointmentId: string,
    toStatus: AppointmentStatus,
    actorUserId: string | null,
    reason?: string,
    extraData: Prisma.AppointmentUpdateInput = {}
  ): Promise<Appointment> {
    const current = await this.findById(appointmentId);

    if (!VALID_TRANSITIONS[current.status].includes(toStatus)) {
      throw new ApiException(
        "APPOINTMENT_TRANSITION_INVALID",
        `No se puede pasar de ${current.status} a ${toStatus}.`,
        HttpStatus.CONFLICT,
        { from: current.status, to: toStatus }
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.appointment.updateMany({
        where: { id: appointmentId, status: current.status },
        data: { status: toStatus, ...extraData },
      });
      if (result.count === 0) {
        throw new ApiException(
          "APPOINTMENT_TRANSITION_INVALID",
          "La cita cambió de estado antes de completar esta transición.",
          HttpStatus.CONFLICT
        );
      }

      await tx.appointmentStatusHistory.create({
        data: {
          appointmentId,
          fromStatus: current.status,
          toStatus,
          changedByUserId: actorUserId,
          reason: reason ?? null,
        },
      });

      return tx.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    });
  }
}
