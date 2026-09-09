import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import type { Appointment, AppointmentCreatedVia, AppointmentStatus, Doctor, Prisma } from "@prisma/client";
import type { AppointmentCreateInput, PublicAppointmentCreateInput } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { modalityForServiceType } from "../service-modality";
import { todayInTimeZone, zonedDateAndMinutesToUtc, formatAppointmentDateLabel } from "../timezone";
import { CareRelationshipService } from "./care-relationship.service";
import { DEFAULT_CANCELLATION_POLICY, resolveCancellationPolicy, refundPercentFor, type CancellationPolicy } from "../cancellation-policy";
import { NotificationsService } from "../../notifications/services/notifications.service";
import { NotificationLinkService } from "../../notifications/services/notification-link.service";
import { AppointmentReminderSchedulerService } from "../../notifications/services/appointment-reminder-scheduler.service";
import type { NotificationTemplateCode } from "@prisma/client";
import {
  renderAppointmentScheduled,
  renderAppointmentConfirmed,
  renderAppointmentCancelled,
  renderAppointmentRescheduled,
} from "../../notifications/services/notification-templates";

function mustGetAppBaseUrl(): string {
  const url = process.env.APP_BASE_URL;
  if (!url) {
    throw new Error("APP_BASE_URL is not set");
  }
  return url;
}

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
  private readonly logger = new Logger(AppointmentStateMachineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly careRelationshipService: CareRelationshipService,
    private readonly notificationsService: NotificationsService,
    private readonly notificationLinkService: NotificationLinkService,
    private readonly reminderScheduler: AppointmentReminderSchedulerService
  ) {}

  // M12: los 4 disparadores de ciclo de vida de cita con plantilla
  // (agendada/confirmada/cancelada/reagendada). El paciente puede no
  // tener cuenta de usuario todavía (Patient.userId es opcional — un
  // médico puede dar de alta un paciente sin invitarlo) — en ese caso
  // no hay a quién notificar y se omite en silencio, no es un error.
  // Sin reintentos (decisión explícita del usuario): si el envío
  // falla, NotificationsService ya lo deja en FAILED y aquí no se
  // hace nada más — la transición de estado de la cita, que es lo que
  // legalmente/operativamente importa, ya se guardó de todos modos.
  private async notifyAppointmentEvent(
    appointment: Appointment,
    templateCode: Extract<
      NotificationTemplateCode,
      "APPOINTMENT_SCHEDULED" | "APPOINTMENT_CONFIRMED" | "APPOINTMENT_CANCELLED" | "APPOINTMENT_RESCHEDULED"
    >,
    dateForLabel: Date,
    // M12-RN-006 (reagenda): la fila de idempotencia se referencia
    // contra la reserva ORIGINAL, no la nueva cita creada por
    // reschedule() — desde la perspectiva del paciente es "esa cita
    // cambió", no una cita distinta. Todo lo demás (paciente, médico,
    // fecha a mostrar) sí viene de `appointment` tal cual se pase.
    relatedEntityIdOverride?: string
  ): Promise<void> {
    const [patient, doctor] = await Promise.all([
      this.prisma.patient.findUnique({ where: { id: appointment.patientId } }),
      this.prisma.doctor.findUnique({ where: { id: appointment.doctorId } }),
    ]);
    if (!patient?.userId || !doctor) {
      return;
    }

    // Todo lo de aquí para abajo —incluyendo emitir el enlace de un
    // solo uso, que también toca la base de datos— va dentro del
    // try/catch. Antes, issue()/buildUrl() quedaban FUERA: un fallo
    // ahí (por ejemplo APP_BASE_URL sin configurar) se propagaba y
    // podía tumbar confirmPayment/confirm/cancel/reschedule, que es
    // exactamente lo que este comentario decía que no debía pasar.
    // Corregido antes de que llegara a producción.
    try {
      const doctorDisplayName = this.doctorDisplayName(doctor);
      const appointmentDateLabel = formatAppointmentDateLabel(dateForLabel);
      const { plainToken } = await this.notificationLinkService.issue(patient.userId, "appointment", appointment.id);
      const actionLink = this.notificationLinkService.buildUrl(mustGetAppBaseUrl(), plainToken);

      const rendered =
        templateCode === "APPOINTMENT_SCHEDULED"
          ? renderAppointmentScheduled({ recipientFirstName: patient.firstName, doctorDisplayName, appointmentDateLabel, actionLink })
          : templateCode === "APPOINTMENT_CONFIRMED"
            ? renderAppointmentConfirmed({ recipientFirstName: patient.firstName, doctorDisplayName, appointmentDateLabel, actionLink })
            : templateCode === "APPOINTMENT_CANCELLED"
              ? renderAppointmentCancelled({ recipientFirstName: patient.firstName, doctorDisplayName, appointmentDateLabel, actionLink })
              : renderAppointmentRescheduled({
                  recipientFirstName: patient.firstName,
                  doctorDisplayName,
                  newAppointmentDateLabel: appointmentDateLabel,
                  actionLink,
                });

      await this.notificationsService.send({
        userId: patient.userId,
        templateCode,
        rendered,
        relatedEntityType: "appointment",
        relatedEntityId: relatedEntityIdOverride ?? appointment.id,
      });
    } catch (error) {
      // No debe tumbar la transición de la cita ya confirmada — el
      // fallo de notificación queda registrado en la fila de
      // Notification (o, si ni siquiera se pudo crear esa fila, aquí)
      // pero nunca revierte ni bloquea la operación de agenda.
      this.logger.warn(`No se pudo enviar notificación ${templateCode} para la cita ${appointment.id}: ${(error as Error).message}`);
    }
  }

  private doctorDisplayName(doctor: Doctor): string {
    return doctor.displayName ?? `Dr(a). ${doctor.legalFirstName} ${doctor.legalLastName}`;
  }

  // M4-CA-001: la única fuente de verdad de "este espacio ya está
  // tomado" es la restricción EXCLUDE de la base de datos, no un
  // chequeo previo en la aplicación (que siempre pierde la carrera
  // bajo concurrencia real — ver la nota técnica de §6.4). Se
  // intenta el INSERT directamente y se traduce la violación en
  // SLOT_TAKEN.
  async create(actingDoctorId: string, actorUserId: string, createdVia: AppointmentCreatedVia, input: AppointmentCreateInput): Promise<Appointment> {
    // R4 — HALLAZGO #1 DEL BLOQUE 0 (26 ago 2026), el más grave del
    // inventario. Esta ruta aceptaba cualquier patientId del cuerpo y
    // createOrRenew(..., "APPOINTMENT") le fabricaba al médico un
    // vínculo ACTIVE de 18 meses en la misma transacción, sin que el
    // paciente interviniera y sin pago. Bastaba agendar contra un
    // servicio propio para que el expediente completo del paciente
    // —timeline y texto íntegro de las notas— respondiera 200.
    //
    // Mientras eso existió, CareRelationshipGuard era decorativo en
    // TODO el sistema: cualquiera podía emitirse la llave que el guard
    // comprueba.
    //
    // La regla ahora: esta ruta RENUEVA un vínculo, nunca lo crea de
    // cero. Tiene que existir uno previo, y las tres vías legítimas de
    // crearlo siguen intactas:
    //   CREATED_BY_DOCTOR  el médico da de alta al paciente (POST /patients)
    //   PATIENT_GRANTED    el paciente autoriza
    //   APPOINTMENT        agendamiento público iniciado por el paciente
    //                      (createFromPublicBooking, abajo)
    //
    // EXPIRED sí cuenta: un paciente que el médico atendió hace dos
    // años vuelve a agendar y el vínculo se renueva. REVOKED no, y esa
    // es la diferencia que importa — si el paciente retiró el
    // consentimiento, agendarle una cita no se lo devuelve.
    const priorRelationship = await this.prisma.careRelationship.findFirst({
      where: { patientId: input.patientId, doctorId: actingDoctorId, status: { in: ["ACTIVE", "EXPIRED"] } },
      select: { id: true },
    });
    if (!priorRelationship) {
      throw new ApiException(
        "CARE_RELATIONSHIP_REQUIRED",
        "No tienes un vínculo con este paciente. Regístralo desde tu lista de pacientes, o espera a que agende él mismo.",
        HttpStatus.FORBIDDEN
      );
    }

    return this.createAppointmentRecord({
      doctorId: actingDoctorId,
      patientId: input.patientId,
      actorUserId,
      createdVia,
      input,
      // Renovación, no alta: la comprobación de vínculo previo de
      // arriba garantiza que ya existe uno.
      linkCareRelationship: (tx) => this.careRelationshipService.createOrRenew(input.patientId, actingDoctorId, "APPOINTMENT", tx),
    });
  }

  // M5-RN-010/M5-RN-011 (spec §7, v2.3) — agendamiento público
  // iniciado por el propio paciente. `patientId` NUNCA viene del
  // cuerpo de la petición (publicAppointmentCreateSchema ni siquiera
  // tiene ese campo) — lo resuelve el controller a partir del usuario
  // autenticado y lo pasa aquí ya resuelto. A diferencia de create()
  // (arriba), esta ruta SÍ puede crear el care_relationship desde
  // cero: es exactamente el caso para el que origin=APPOINTMENT se
  // reservó (ver el comentario de create()).
  async createFromPublicBooking(
    doctorId: string,
    patientId: string,
    callerUserId: string,
    input: PublicAppointmentCreateInput
  ): Promise<Appointment> {
    return this.createAppointmentRecord({
      doctorId,
      patientId,
      actorUserId: callerUserId,
      createdVia: "PATIENT_LINK",
      input,
      linkCareRelationship: (tx) => this.careRelationshipService.createOrRenew(patientId, doctorId, "APPOINTMENT", tx),
    });
  }

  // Mecánica compartida entre create() y createFromPublicBooking():
  // validar servicio/paciente/ventana de agenda, insertar la cita y su
  // primera fila de historial, y vincular el care_relationship —
  // exactamente atómico, misma transacción. `patientId` es siempre un
  // parámetro explícito, nunca leído de `input` — así ninguna de las
  // dos rutas puede, por accidente futuro, volver a confiar en un
  // patientId de body (el error que el Bloque 0 cerró).
  private async createAppointmentRecord(params: {
    doctorId: string;
    patientId: string;
    actorUserId: string;
    createdVia: AppointmentCreatedVia;
    input: PublicAppointmentCreateInput;
    linkCareRelationship: (tx: Prisma.TransactionClient) => Promise<unknown>;
  }): Promise<Appointment> {
    const { doctorId, patientId, actorUserId, createdVia, input, linkCareRelationship } = params;

    const service = await this.prisma.doctorService.findFirst({
      where: { id: input.serviceId, doctorId, isActive: true },
    });
    if (!service) {
      throw new ApiException("SERVICE_NOT_FOUND", "Servicio no encontrado para este médico.", HttpStatus.NOT_FOUND);
    }

    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) {
      throw new ApiException("PATIENT_NOT_FOUND", "Paciente no encontrado.", HttpStatus.NOT_FOUND);
    }

    const doctor = await this.prisma.doctor.findUniqueOrThrow({ where: { id: doctorId } });

    // M2-RN-004/M2-CA-006: "necesita >=1 consultorio activo o
    // teleconsulta habilitada para recibir citas." DOCTOR_NOT_ACCEPTING_PATIENTS
    // es el código que la spec ya nombra para esto en la tabla de
    // errores de M5 (§7) — no es un código inventado aquí.
    if (!doctor.acceptsTeleconsultation) {
      const activeLocationCount = await this.prisma.practiceLocation.count({
        where: { doctorId, isActive: true },
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
            patientId,
            doctorId,
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

        await linkCareRelationship(tx);

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

  // M5-RN-009 (v2.3): "Mis citas" del portal de paciente — todas las
  // suyas, no acotadas a un día como listForDoctor (una agenda de
  // médico se ve por día; las citas de un paciente se ven todas).
  async listForPatient(patientId: string) {
    return this.prisma.appointment.findMany({
      where: { patientId },
      orderBy: { startsAt: "desc" },
      include: {
        doctor: { select: { displayName: true, legalFirstName: true, legalLastName: true, slug: true } },
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
    const updated = await this.transition(appointmentId, "SCHEDULED", actorUserId, "Pago confirmado.");
    await this.notifyAppointmentEvent(updated, "APPOINTMENT_SCHEDULED", updated.startsAt);
    // M12: se programa aquí, no en confirm() — startsAt ya es
    // definitivo en cuanto el pago se confirma (pending_payment ->
    // scheduled); confirm() (scheduled -> confirmed) no cambia la
    // hora, así que reprogramar ahí duplicaría el intento (aunque
    // scheduleAppointmentReminders es idempotente por jobId).
    await this.reminderScheduler.scheduleAppointmentReminders(updated);
    return updated;
  }

  async confirm(appointmentId: string, actorUserId: string): Promise<Appointment> {
    const updated = await this.transition(appointmentId, "CONFIRMED", actorUserId);
    await this.notifyAppointmentEvent(updated, "APPOINTMENT_CONFIRMED", updated.startsAt);
    return updated;
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

    await this.notifyAppointmentEvent(updated, "APPOINTMENT_CANCELLED", updated.startsAt);
    await this.reminderScheduler.cancelAppointmentReminders(updated.id);

    return { appointment: updated, refundPercent };
  }

  // M5-RN-004: "Reagenda = cancelación + nueva cita ligada por
  // rescheduled_from_id, conservando el pago." La nueva cita nace en
  // SCHEDULED (no pending_payment) precisamente porque el pago ya
  // estaba confirmado en la original — es la única vía de creación
  // que empieza fuera de pending_payment, y es deliberada, no un
  // atajo alrededor de la máquina de estados.
  async reschedule(appointmentId: string, actorUserId: string, cancelledAsRole: CancellingRole, newStartsAt: string): Promise<Appointment> {
    const created = await this.rescheduleTransaction(appointmentId, actorUserId, cancelledAsRole, newStartsAt);
    // M12: APPOINTMENT_RESCHEDULED se referencia contra la cita
    // ORIGINAL (relatedEntityId) porque es "esa reserva la que
    // cambió" desde la perspectiva del paciente — la fecha que se
    // comunica es la de la cita nueva.
    await this.notifyAppointmentEvent(created, "APPOINTMENT_RESCHEDULED", created.startsAt, appointmentId);
    // La cita original ya no ocurrirá — se cancelan sus recordatorios
    // pendientes y se programan los de la nueva (rescheduleTransaction
    // la crea directo en SCHEDULED, ver comentario ahí, así que sí
    // necesita sus propios recordatorios igual que confirmPayment()).
    await this.reminderScheduler.cancelAppointmentReminders(appointmentId);
    await this.reminderScheduler.scheduleAppointmentReminders(created);
    return created;
  }

  private async rescheduleTransaction(
    appointmentId: string,
    actorUserId: string,
    cancelledAsRole: CancellingRole,
    newStartsAt: string
  ): Promise<Appointment> {
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
