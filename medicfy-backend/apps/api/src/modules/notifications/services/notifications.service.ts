import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Notification, NotificationTemplateCode } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { NOTIFICATION_CHANNEL_ADAPTER, type NotificationChannelAdapter } from "./notification-channel-adapter.port";
import type { RenderedNotification } from "./notification-templates";

export interface SendNotificationInput {
  userId: string;
  templateCode: NotificationTemplateCode;
  rendered: RenderedNotification;
  // M12-RN-006: idempotencia por (user_id, template_code,
  // related_entity_id). relatedEntityId es obligatorio aquí a
  // propósito — cada disparador real (cita, receta, orden, resultado,
  // verificación de médico) tiene una entidad de negocio concreta que
  // lo identifica de forma única; sin ella, dos llamadas legítimas
  // para el mismo tipo de evento (dos citas distintas, por ejemplo)
  // colisionarían entre sí en la restricción única del esquema.
  relatedEntityType: string;
  relatedEntityId: string;
}

// M12: envío transaccional con persistencia, idempotencia y
// preferencia de canal — sin cola de reintentos (decisión explícita
// del usuario, 2026-09-08: "sin reintentos por ahora, solo enviar y
// marcar éxito/fallo"). Si el envío falla, la notificación queda en
// FAILED y ahí se queda; un reintento futuro es un backlog conocido,
// no un bug de este módulo.
//
// PENDIENTE(jorge) evaluado y descartado a propósito: no se usa
// AuditService/audit_log aquí. R3/AuditResult (schema.prisma) modela
// específicamente acceso a datos ("SUCCESS" | "DENIED" de una lectura),
// no éxito/fallo de una entrega de mensaje — forzar un fallo de envío
// dentro de ese enum sería mal uso del audit_log de cumplimiento. El
// estado de entrega ya vive, con más detalle, en las columnas de
// Notification (status/sentAt/failedAt/failureReason), que es su
// dueño natural.
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_CHANNEL_ADAPTER) private readonly channelAdapter: NotificationChannelAdapter
  ) {}

  async send(input: SendNotificationInput): Promise<Notification> {
    const user = await this.prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) {
      throw new Error(`NotificationsService.send: user ${input.userId} not found`);
    }

    // M12-CA-003: "reintentar un envío no duplica" — si ya existe una
    // fila para esta clave de idempotencia, esa es la respuesta,
    // nunca se crea ni se reenvía una segunda.
    const existing = await this.prisma.notification.findUnique({
      where: {
        userId_templateCode_relatedEntityId: {
          userId: input.userId,
          templateCode: input.templateCode,
          relatedEntityId: input.relatedEntityId,
        },
      },
    });
    if (existing) {
      return existing;
    }

    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        templateCode: input.templateCode,
        channel: "EMAIL",
        status: "PENDING",
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: input.relatedEntityId,
        templateData: { subject: input.rendered.subject, body: input.rendered.body },
      },
    });

    // M12-RN-005: WhatsApp no tiene proveedor todavía (M12-RN-004) —
    // toda preferencia WHATSAPP hace fallback automático a email hasta
    // que exista un adaptador real. Se registra igual en audit_log
    // para que quede visible cuántos usuarios están esperando un canal
    // que todavía no existe.
    const requestedWhatsApp = user.notificationChannelPreference === "WHATSAPP";
    let sendError: string | undefined;
    try {
      if (requestedWhatsApp) {
        try {
          await this.channelAdapter.sendWhatsApp(user.phoneE164 ?? "", input.rendered.body);
        } catch (whatsAppError) {
          this.logger.warn(
            `WhatsApp send unavailable for notification ${notification.id}, falling back to email: ${(whatsAppError as Error).message}`
          );
          await this.channelAdapter.sendEmail(user.email, input.rendered.subject, input.rendered.body);
        }
      } else {
        await this.channelAdapter.sendEmail(user.email, input.rendered.subject, input.rendered.body);
      }
    } catch (error) {
      sendError = (error as Error).message;
    }

    const updated = await this.prisma.notification.update({
      where: { id: notification.id },
      data: sendError
        ? { status: "FAILED", failedAt: new Date(), failureReason: sendError }
        : { status: "SENT", sentAt: new Date(), channel: requestedWhatsApp ? "WHATSAPP" : "EMAIL" },
    });

    if (sendError) {
      this.logger.warn(`Notification ${notification.id} (${input.templateCode}) failed to send: ${sendError}`);
    }

    return updated;
  }
}
