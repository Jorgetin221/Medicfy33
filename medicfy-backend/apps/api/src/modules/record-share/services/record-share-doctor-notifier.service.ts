import { Injectable, Logger } from "@nestjs/common";
import type { NotificationTemplateCode, ShareScope } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { NotificationsService } from "../../notifications/services/notifications.service";
import type { RenderedNotification } from "../../notifications/services/notification-templates";
import {
  renderRecordShareApproved,
  renderRecordShareCustodianNotice,
  renderRecordShareExpiring,
  renderRecordShareNotAuthorized,
  renderRecordShareRevoked,
} from "../../notifications/services/notification-templates";
import { doctorDisplayName } from "../record-share-display.util";
import { safeErrorLabel } from "../record-share-log.util";
import { recordShareWebOrigin } from "../record-share-web-origin.util";

const MX_TIME_ZONE = "America/Mexico_City";

// CLAUDE.md §4: presentación en America/Mexico_City vía Intl, nunca
// offsets fijos — mismo criterio que scheduling/timezone.ts.
export function formatMxDateLabel(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, dateStyle: "long" }).format(date);
}

/**
 * PR-EXP-06 — avisos a MÉDICOS (solicitante y custodio), por
 * NotificationsService (M12): persistencia, idempotencia
 * (usuario, plantilla, entidad) y plantillas sin contenido clínico
 * por construcción. El paciente (sin cuenta) NO pasa por aquí — va por
 * RecordShareNotificationPort.
 *
 * Un fallo al avisar NUNCA debe deshacer ni bloquear la acción que lo
 * disparó (aprobar, revocar, expirar): el estado ya quedó en la base y
 * en audit_log. Se registra el fallo sin datos del mensaje (R2).
 */
@Injectable()
export class RecordShareDoctorNotifierService {
  private readonly logger = new Logger(RecordShareDoctorNotifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService
  ) {}

  async approved(grant: { id: string; requesterDoctorId: string; expiresAt: Date }): Promise<void> {
    const doctor = await this.prisma.doctor.findUniqueOrThrow({ where: { id: grant.requesterDoctorId } });
    await this.safeSend(doctor.userId, "RECORD_SHARE_APPROVED", "record_share_grant", grant.id, renderRecordShareApproved({
      recipientFirstName: doctor.legalFirstName,
      expiresAtLabel: formatMxDateLabel(grant.expiresAt),
      actionLink: `${recordShareWebOrigin()}/expediente-compartido/compartidos-conmigo`,
    }));
  }

  // RE5: rechazada y vencida sin respuesta usan ESTE mismo método — el
  // solicitante recibe exactamente el mismo mensaje en los dos casos.
  async notAuthorized(request: { id: string; requesterDoctorId: string }): Promise<void> {
    const doctor = await this.prisma.doctor.findUniqueOrThrow({ where: { id: request.requesterDoctorId } });
    await this.safeSend(doctor.userId, "RECORD_SHARE_NOT_AUTHORIZED", "record_share_request", request.id, renderRecordShareNotAuthorized({
      recipientFirstName: doctor.legalFirstName,
      actionLink: `${recordShareWebOrigin()}/expediente-compartido/mis-solicitudes`,
    }));
  }

  async revoked(grant: { id: string; requesterDoctorId: string }): Promise<void> {
    const doctor = await this.prisma.doctor.findUniqueOrThrow({ where: { id: grant.requesterDoctorId } });
    await this.safeSend(doctor.userId, "RECORD_SHARE_REVOKED", "record_share_grant", grant.id, renderRecordShareRevoked({
      recipientFirstName: doctor.legalFirstName,
      actionLink: `${recordShareWebOrigin()}/expediente-compartido/compartidos-conmigo`,
    }));
  }

  async expiring(grant: { id: string; requesterDoctorId: string; expiresAt: Date }): Promise<void> {
    const doctor = await this.prisma.doctor.findUniqueOrThrow({ where: { id: grant.requesterDoctorId } });
    await this.safeSend(doctor.userId, "RECORD_SHARE_EXPIRING", "record_share_grant", grant.id, renderRecordShareExpiring({
      recipientFirstName: doctor.legalFirstName,
      expiresAtLabel: formatMxDateLabel(grant.expiresAt),
      actionLink: `${recordShareWebOrigin()}/expediente-compartido/compartidos-conmigo`,
    }));
  }

  // RE9 (decisión 3 del plan): sin el nombre del paciente — el enlace
  // lleva al expediente (id opaco, detrás de sesión y de
  // CareRelationshipGuard), donde el custodio sí ve quién es.
  async custodianNotice(grant: {
    id: string;
    patientId: string;
    requesterDoctorId: string;
    custodianDoctorId: string;
    scope: ShareScope[];
    expiresAt: Date;
  }): Promise<void> {
    const [custodian, requester] = await Promise.all([
      this.prisma.doctor.findUniqueOrThrow({ where: { id: grant.custodianDoctorId } }),
      this.prisma.doctor.findUniqueOrThrow({ where: { id: grant.requesterDoctorId } }),
    ]);
    await this.safeSend(custodian.userId, "RECORD_SHARE_CUSTODIAN_NOTICE", "record_share_grant", grant.id, renderRecordShareCustodianNotice({
      recipientFirstName: custodian.legalFirstName,
      requesterDisplayName: doctorDisplayName(requester),
      scope: grant.scope,
      expiresAtLabel: formatMxDateLabel(grant.expiresAt),
      actionLink: `${recordShareWebOrigin()}/pacientes/${grant.patientId}`,
    }));
  }

  private async safeSend(
    userId: string,
    templateCode: NotificationTemplateCode,
    relatedEntityType: string,
    relatedEntityId: string,
    rendered: RenderedNotification
  ): Promise<void> {
    try {
      await this.notifications.send({ userId, templateCode, rendered, relatedEntityType, relatedEntityId });
    } catch (error) {
      this.logger.error(`record-share notification ${templateCode} failed: ${safeErrorLabel(error)}`);
    }
  }
}
