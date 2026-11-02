import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { AuditService } from "../../identity/services/audit.service";
import { RecordShareDoctorNotifierService } from "./record-share-doctor-notifier.service";
import { safeErrorLabel } from "../record-share-log.util";

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
// Sección B: aviso "por vencer" 48 h antes.
const EXPIRING_NOTICE_WINDOW_MS = 48 * 60 * 60 * 1000;
const BATCH_SIZE = 200;

/**
 * PR-EXP-06 (decisión 5): barrido cada 5 min, mismo patrón que
 * AppointmentSweepService (setInterval + unref, apagado en test, un
 * solo barrido a la vez). NO reemplaza la expiración perezosa del
 * SharedRecordGuard — el guard sigue siendo la barrera real (RE4); el
 * barrido existe para que las transiciones y los avisos ocurran
 * aunque nadie intente acceder.
 *
 * Cada transición es compare-and-set (updateMany con el estado
 * anterior en el where): si el guard, el paciente o un admin ganaron
 * la carrera, count=0 y no se audita ni se avisa dos veces.
 */
@Injectable()
export class RecordShareSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecordShareSweepService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly doctorNotifier: RecordShareDoctorNotifierService
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(now: Date = new Date()): Promise<{ requestsExpired: number; grantsExpired: number; expiringNotified: number }> {
    if (this.running) return { requestsExpired: 0, grantsExpired: 0, expiringNotified: 0 };
    this.running = true;
    try {
      const requestsExpired = await this.expireUnansweredRequests(now);
      const grantsExpired = await this.expireGrants(now);
      const expiringNotified = await this.notifyExpiringGrants(now);
      if (requestsExpired + grantsExpired + expiringNotified > 0) {
        this.logger.log(`Barrido de expediente compartido: ${requestsExpired} solicitudes vencidas, ${grantsExpired} accesos vencidos, ${expiringNotified} avisos por vencer.`);
      }
      return { requestsExpired, grantsExpired, expiringNotified };
    } catch (error) {
      this.logger.error(`Barrido de expediente compartido falló: ${safeErrorLabel(error)}`);
      return { requestsExpired: 0, grantsExpired: 0, expiringNotified: 0 };
    } finally {
      this.running = false;
    }
  }

  private async expireUnansweredRequests(now: Date): Promise<number> {
    const due = await this.prisma.recordShareRequest.findMany({
      // Doble autorización: también vence si el paciente ya aprobó pero
      // su médico tratante no respondió a tiempo.
      where: { status: { in: ["PENDING_PATIENT", "PENDING_CUSTODIAN"] }, expiresAt: { lt: now } },
      take: BATCH_SIZE,
    });
    let expired = 0;
    for (const request of due) {
      const { count } = await this.prisma.recordShareRequest.updateMany({
        where: { id: request.id, status: { in: ["PENDING_PATIENT", "PENDING_CUSTODIAN"] } },
        data: { status: "EXPIRED_UNANSWERED" },
      });
      if (count === 0) continue;
      expired += 1;
      await this.auditService.log({
        action: "SHARE_REQUEST_EXPIRED",
        resourceType: "record_share_request",
        resourceId: request.id,
        patientId: request.patientId,
        result: "SUCCESS",
      });
      // RE5: mismo aviso que una negativa explícita.
      await this.doctorNotifier.notAuthorized(request);
    }
    return expired;
  }

  private async expireGrants(now: Date): Promise<number> {
    const due = await this.prisma.recordShareGrant.findMany({
      where: { status: "ACTIVE", expiresAt: { lt: now } },
      take: BATCH_SIZE,
    });
    let expired = 0;
    for (const grant of due) {
      const { count } = await this.prisma.recordShareGrant.updateMany({
        where: { id: grant.id, status: "ACTIVE" },
        data: { status: "EXPIRED" },
      });
      if (count === 0) continue;
      expired += 1;
      await this.auditService.log({
        action: "SHARE_GRANT_EXPIRED",
        resourceType: "record_share_grant",
        resourceId: grant.id,
        patientId: grant.patientId,
        result: "SUCCESS",
        metadata: { via: "sweep" },
      });
    }
    return expired;
  }

  // Idempotente por construcción: NotificationsService deduplica por
  // (usuario, plantilla, grant) — el barrido puede ver el mismo grant
  // en varias pasadas dentro de las 48 h sin mandar dos avisos.
  private async notifyExpiringGrants(now: Date): Promise<number> {
    const soon = await this.prisma.recordShareGrant.findMany({
      where: { status: "ACTIVE", expiresAt: { gt: now, lte: new Date(now.getTime() + EXPIRING_NOTICE_WINDOW_MS) } },
      take: BATCH_SIZE,
    });
    for (const grant of soon) {
      await this.doctorNotifier.expiring(grant);
    }
    return soon.length;
  }
}
