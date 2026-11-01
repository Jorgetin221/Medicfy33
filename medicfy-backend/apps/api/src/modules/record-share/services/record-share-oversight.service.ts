import { HttpStatus, Injectable } from "@nestjs/common";
import type { RecordShareAbuseReport, RecordShareCustodianGrant } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { AuditService } from "../../identity/services/audit.service";
import type { RequestMeta } from "../../identity/services/auth.service";
import { doctorDisplayName } from "../record-share-display.util";
import { RecordShareDoctorNotifierService } from "./record-share-doctor-notifier.service";

const GRANT_NOT_FOUND_MESSAGE = "No se encontró ese acceso compartido.";
const ABUSE_REPORTS_LIMIT = 200;

/**
 * PR-EXP-06 — supervisión (06-notificaciones-revocacion-caducidad.md
 * decisiones 1 y 7):
 *  - CUSTODIO: ve quién tiene/tuvo acceso a SU paciente y cuándo se
 *    consultó (de audit_log SHARE_VIEWED); puede reportar abuso. No
 *    revoca — la decisión es del paciente.
 *  - ADMIN: ve la cola de reportes (audit_log SHARE_ABUSE_REPORTED, sin
 *    tabla nueva) y puede suspender un grant. Solo metadatos (R4) —
 *    nunca contenido clínico.
 */
@Injectable()
export class RecordShareOversightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly doctorNotifier: RecordShareDoctorNotifierService
  ) {}

  async listForCustodian(actorUserId: string, custodianDoctorId: string, patientId: string, meta: RequestMeta): Promise<RecordShareCustodianGrant[]> {
    const grants = await this.prisma.recordShareGrant.findMany({
      where: { patientId, custodianDoctorId },
      include: { requesterDoctor: true },
      orderBy: { startsAt: "desc" },
    });
    const grantIds = grants.map((g) => g.id);
    const events = grantIds.length
      ? await this.prisma.auditLog.findMany({
          where: { resourceType: "record_share_grant", resourceId: { in: grantIds }, action: { in: ["SHARE_VIEWED", "SHARE_ABUSE_REPORTED"] }, result: "SUCCESS" },
          select: { resourceId: true, action: true, occurredAt: true },
          orderBy: { occurredAt: "desc" },
        })
      : [];

    await this.auditService.log({
      actorUserId,
      actorRole: "DOCTOR",
      action: "SHARE_CUSTODIAN_LISTED",
      resourceType: "patient",
      resourceId: patientId,
      patientId,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return grants.map((g) => {
      const own = events.filter((e) => e.resourceId === g.id);
      return {
        id: g.id,
        requesterDisplayName: doctorDisplayName(g.requesterDoctor),
        requesterLicense: g.requesterDoctor.professionalLicense,
        scope: g.scope,
        status: g.status,
        startsAt: g.startsAt.toISOString(),
        expiresAt: g.expiresAt.toISOString(),
        revokedAt: g.revokedAt?.toISOString() ?? null,
        views: own.filter((e) => e.action === "SHARE_VIEWED").map((e) => ({ viewedAt: e.occurredAt.toISOString() })),
        abuseReported: own.some((e) => e.action === "SHARE_ABUSE_REPORTED"),
      };
    });
  }

  async reportAbuse(actorUserId: string, custodianDoctorId: string, patientId: string, grantId: string, reason: string, meta: RequestMeta): Promise<void> {
    const grant = await this.prisma.recordShareGrant.findFirst({ where: { id: grantId, patientId, custodianDoctorId } });
    if (!grant) {
      throw new ApiException("RECORD_SHARE_GRANT_NOT_FOUND", GRANT_NOT_FOUND_MESSAGE, HttpStatus.NOT_FOUND);
    }
    await this.auditService.log({
      actorUserId,
      actorRole: "DOCTOR",
      action: "SHARE_ABUSE_REPORTED",
      resourceType: "record_share_grant",
      resourceId: grant.id,
      patientId,
      justification: reason,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  async listAbuseReports(): Promise<RecordShareAbuseReport[]> {
    const reports = await this.prisma.auditLog.findMany({
      where: { action: "SHARE_ABUSE_REPORTED", resourceType: "record_share_grant", result: "SUCCESS" },
      orderBy: { occurredAt: "desc" },
      take: ABUSE_REPORTS_LIMIT,
    });
    const grantIds = [...new Set(reports.map((r) => r.resourceId).filter((id): id is string => id !== null))];
    const grants = await this.prisma.recordShareGrant.findMany({
      where: { id: { in: grantIds } },
      include: { requesterDoctor: true, custodianDoctor: true },
    });
    const byId = new Map(grants.map((g) => [g.id, g]));

    return reports.flatMap((r) => {
      const grant = r.resourceId ? byId.get(r.resourceId) : undefined;
      if (!grant) return [];
      return [
        {
          auditId: r.id,
          grantId: grant.id,
          reportedAt: r.occurredAt.toISOString(),
          reason: r.justification ?? "",
          requesterDisplayName: doctorDisplayName(grant.requesterDoctor),
          requesterLicense: grant.requesterDoctor.professionalLicense,
          custodianDisplayName: doctorDisplayName(grant.custodianDoctor),
          grantStatus: grant.status,
          grantExpiresAt: grant.expiresAt.toISOString(),
        },
      ];
    });
  }

  async suspend(actorUserId: string, actorRole: string, grantId: string, reason: string, meta: RequestMeta): Promise<void> {
    const { count } = await this.prisma.recordShareGrant.updateMany({
      where: { id: grantId, status: "ACTIVE" },
      data: { status: "SUSPENDED_BY_ADMIN", revokedAt: new Date(), revokedReason: reason },
    });
    if (count === 0) {
      throw new ApiException("RECORD_SHARE_GRANT_NOT_ACTIVE", "Ese acceso ya no está vigente.", HttpStatus.CONFLICT);
    }
    const grant = await this.prisma.recordShareGrant.findUniqueOrThrow({ where: { id: grantId } });
    await this.auditService.log({
      actorUserId,
      actorRole,
      action: "SHARE_SUSPENDED_BY_ADMIN",
      resourceType: "record_share_grant",
      resourceId: grant.id,
      patientId: grant.patientId,
      justification: reason,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    // Mismo aviso neutro que una revocación: el solicitante pierde el
    // acceso; el motivo administrativo no viaja por notificación.
    await this.doctorNotifier.revoked(grant);
  }
}
