import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Queue, Worker, type Job } from "bullmq";
import type { Appointment } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { NotificationsService } from "./notifications.service";
import { NotificationLinkService } from "./notification-link.service";
import { renderAppointmentReminder24h, renderAppointmentReminder2h } from "./notification-templates";
import { formatAppointmentDateLabel } from "../../scheduling/timezone";

const QUEUE_NAME = "appointment-reminders";
const REMINDER_24H_MS = 24 * 60 * 60 * 1000;
const REMINDER_2H_MS = 2 * 60 * 60 * 1000;

type ReminderKind = "24h" | "2h";

interface ReminderJobData {
  appointmentId: string;
  kind: ReminderKind;
}

function mustGetAppBaseUrl(): string {
  const url = process.env.APP_BASE_URL;
  if (!url) {
    throw new Error("APP_BASE_URL is not set");
  }
  return url;
}

// M12: recordatorios de cita 24h/2h antes — decisión explícita del
// usuario, 2026-09-08, de construir el productor/consumidor real con
// Redis+BullMQ en vez de dejarlo pendiente. Mismo principio de
// degradación honesta que ClaudeModelAdapter con ANTHROPIC_API_KEY:
// sin REDIS_URL configurado, todo este servicio es un no-op
// documentado — agendar, confirmar, cancelar y reagendar una cita
// siguen funcionando con normalidad, solo no habrá recordatorio.
// No hay Redis real en ningún entorno donde se construyó esto (ni en
// el sandbox de nube, ni en esta máquina) — el productor/consumidor
// nunca se ejecutó contra un Redis de verdad; queda pendiente
// verificarlo end-to-end el día que haya uno disponible.
@Injectable()
export class AppointmentReminderSchedulerService implements OnModuleDestroy {
  private readonly logger = new Logger(AppointmentReminderSchedulerService.name);
  private queue: Queue<ReminderJobData> | null = null;
  private worker: Worker<ReminderJobData> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly notificationLinkService: NotificationLinkService
  ) {}

  private getQueue(): Queue<ReminderJobData> | null {
    const url = process.env.REDIS_URL;
    if (!url) return null;
    if (!this.queue) {
      // maxRetriesPerRequest: null es requisito documentado de BullMQ
      // para la conexión que usa un Worker (comandos bloqueantes) —
      // se aplica también aquí por simplicidad, una sola conexión por
      // proceso en vez de dos configuraciones distintas.
      this.queue = new Queue<ReminderJobData>(QUEUE_NAME, { connection: { url, maxRetriesPerRequest: null } });
      this.startWorker(url);
    }
    return this.queue;
  }

  private startWorker(url: string): void {
    if (this.worker) return;
    this.worker = new Worker<ReminderJobData>(
      QUEUE_NAME,
      async (job: Job<ReminderJobData>) => this.processReminder(job.data),
      { connection: { url, maxRetriesPerRequest: null } }
    );
    this.worker.on("failed", (job, error) => {
      this.logger.warn(`Recordatorio de cita falló (job ${job?.id ?? "desconocido"}): ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  // Se llama una sola vez, cuando la cita entra a SCHEDULED (pago
  // confirmado) — no en confirm() (CONFIRMED), porque ahí startsAt no
  // cambia y ya se programó. reschedule() cancela y vuelve a llamar
  // esto para la cita nueva.
  async scheduleAppointmentReminders(appointment: Pick<Appointment, "id" | "startsAt">): Promise<void> {
    const queue = this.getQueue();
    if (!queue) {
      this.logger.debug(`REDIS_URL no configurado — sin recordatorio programado para la cita ${appointment.id}.`);
      return;
    }
    const now = Date.now();
    const startsAtMs = appointment.startsAt.getTime();
    await this.scheduleOne(queue, appointment.id, "24h", startsAtMs - REMINDER_24H_MS, now);
    await this.scheduleOne(queue, appointment.id, "2h", startsAtMs - REMINDER_2H_MS, now);
  }

  private async scheduleOne(
    queue: Queue<ReminderJobData>,
    appointmentId: string,
    kind: ReminderKind,
    fireAtMs: number,
    nowMs: number
  ): Promise<void> {
    const delay = fireAtMs - nowMs;
    // Cita agendada con menos de 24h/2h de anticipación: "tu cita es
    // mañana" unas horas antes de que ocurra sería confuso, no útil —
    // se omite ese recordatorio en vez de dispararlo tarde o de
    // inmediato.
    if (delay <= 0) return;
    try {
      await queue.add(
        `reminder-${kind}`,
        { appointmentId, kind },
        {
          jobId: this.jobId(appointmentId, kind),
          delay,
          removeOnComplete: true,
          removeOnFail: true,
        }
      );
    } catch (error) {
      this.logger.warn(`No se pudo encolar el recordatorio ${kind} de la cita ${appointmentId}: ${(error as Error).message}`);
    }
  }

  // Se llama al cancelar o reagendar. Sin reintentos ni garantías
  // fuertes de entrega exactamente-una-vez — si esto fallara y el job
  // igual disparara más tarde, processReminder() abajo vuelve a leer
  // el estado real de la cita y no envía nada si ya no está
  // SCHEDULED/CONFIRMED (además de la idempotencia de
  // NotificationsService por si acaso).
  async cancelAppointmentReminders(appointmentId: string): Promise<void> {
    const queue = this.getQueue();
    if (!queue) return;
    try {
      await queue.remove(this.jobId(appointmentId, "24h"));
      await queue.remove(this.jobId(appointmentId, "2h"));
    } catch (error) {
      this.logger.warn(`No se pudo cancelar el recordatorio de la cita ${appointmentId}: ${(error as Error).message}`);
    }
  }

  private jobId(appointmentId: string, kind: ReminderKind): string {
    return `appointment-reminder-${kind}:${appointmentId}`;
  }

  private async processReminder(data: ReminderJobData): Promise<void> {
    const appointment = await this.prisma.appointment.findUnique({ where: { id: data.appointmentId } });
    if (!appointment || (appointment.status !== "SCHEDULED" && appointment.status !== "CONFIRMED")) {
      return;
    }
    const [patient, doctor] = await Promise.all([
      this.prisma.patient.findUnique({ where: { id: appointment.patientId } }),
      this.prisma.doctor.findUnique({ where: { id: appointment.doctorId } }),
    ]);
    if (!patient?.userId || !doctor) return;

    const doctorDisplayName = doctor.displayName ?? `Dr(a). ${doctor.legalFirstName} ${doctor.legalLastName}`;
    const appointmentDateLabel = formatAppointmentDateLabel(appointment.startsAt);
    const { plainToken } = await this.notificationLinkService.issue(patient.userId, "appointment", appointment.id);
    const actionLink = this.notificationLinkService.buildUrl(mustGetAppBaseUrl(), plainToken);

    // No hay campo de enlace de videoconsulta en el esquema todavía
    // (M5 no lo modela) — se omite en vez de inventarlo; ver
    // renderAppointmentReminder2h, donde videoLink es opcional.
    const rendered =
      data.kind === "24h"
        ? renderAppointmentReminder24h({ recipientFirstName: patient.firstName, doctorDisplayName, appointmentDateLabel, actionLink })
        : renderAppointmentReminder2h({ recipientFirstName: patient.firstName, doctorDisplayName, appointmentDateLabel, actionLink });

    await this.notificationsService.send({
      userId: patient.userId,
      templateCode: data.kind === "24h" ? "APPOINTMENT_REMINDER_24H" : "APPOINTMENT_REMINDER_2H",
      rendered,
      relatedEntityType: "appointment",
      relatedEntityId: appointment.id,
    });
  }
}
