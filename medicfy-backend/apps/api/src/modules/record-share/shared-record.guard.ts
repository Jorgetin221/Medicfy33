import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import type { RecordShareGrant } from "@prisma/client";
import { ApiException } from "../../common/api-exception";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { AuditService } from "../identity/services/audit.service";
import { getRequestMeta } from "../identity/request-meta";

export interface SharedRecordRequest extends AuthenticatedRequest {
  shareGrant?: RecordShareGrant;
}

// SharedRecordGuard siempre pone shareGrant antes de dejar pasar la
// request — este helper documenta esa invariante sin recurrir a `!`
// (prohibido por lint) y falla alto si alguna vez se llama sin el
// guard por delante.
export function mustShareGrant(req: SharedRecordRequest): RecordShareGrant {
  if (!req.shareGrant) throw new Error("SharedRecordGuard no corrió antes de este handler — invariante rota.");
  return req.shareGrant;
}

const DENIED_MESSAGE = "No tienes acceso a este expediente compartido.";

// PR-EXP-05. A propósito NO extiende ni compone CareRelationshipGuard
// (00-DESCUBRIMIENTO.md Q2 / 01-modelo-de-datos.md §decisión): ese
// guard da paridad de lectura+escritura con el médico tratante — un
// RecordShareGrant es de SOLO LECTURA y con alcance parcial, así que
// necesita su propio guard, independiente.
//
// R4/RE4: TODO en el servidor, en CADA request — existencia, dueño,
// estado y vigencia. Expiración perezosa (mismo patrón que
// CareRelationshipService.hasActiveRelationship, sin scheduler): se
// revisa expiresAt aquí y recién entonces se marca EXPIRED.
//
// Un solo motivo de fallo, siempre el mismo mensaje y código — la
// razón real solo queda en audit_log (metadata.reason), nunca en la
// respuesta HTTP.
@Injectable()
export class SharedRecordGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<SharedRecordRequest>();
    const meta = getRequestMeta(req);
    const grantIdParam = req.params.grantId;
    const grantId = typeof grantIdParam === "string" ? grantIdParam : undefined;

    const doctor = await this.prisma.doctor.findUnique({ where: { userId: req.user.sub } });
    const grant = grantId ? await this.prisma.recordShareGrant.findUnique({ where: { id: grantId } }) : null;

    if (!doctor) return this.deny(req.user.sub, grantId, meta, "not_a_doctor");
    if (!grant) return this.deny(req.user.sub, grantId, meta, "grant_not_found");
    if (grant.requesterDoctorId !== doctor.id) return this.deny(req.user.sub, grantId, meta, "not_the_requester");
    if (grant.status !== "ACTIVE") return this.deny(req.user.sub, grantId, meta, "not_active");
    if (grant.expiresAt < new Date()) {
      // PR-EXP-06 (decisión 5): compare-and-set — si el barrido ya la
      // marcó, no se audita la transición dos veces.
      const { count } = await this.prisma.recordShareGrant.updateMany({
        where: { id: grant.id, status: "ACTIVE" },
        data: { status: "EXPIRED" },
      });
      if (count > 0) {
        await this.auditService.log({
          action: "SHARE_GRANT_EXPIRED",
          resourceType: "record_share_grant",
          resourceId: grant.id,
          patientId: grant.patientId,
          result: "SUCCESS",
          metadata: { via: "lazy_guard" },
        });
      }
      return this.deny(req.user.sub, grantId, meta, "expired");
    }

    req.shareGrant = grant;
    return true;
  }

  private async deny(
    actorUserId: string,
    grantId: string | undefined,
    meta: { ip: string; userAgent: string },
    reason: string
  ): Promise<never> {
    await this.auditService.log({
      actorUserId,
      actorRole: "DOCTOR",
      action: "SHARE_ACCESS_DENIED",
      resourceType: "record_share_grant",
      ...(grantId ? { resourceId: grantId } : {}),
      result: "DENIED",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { reason },
    });
    throw new ApiException("RECORD_SHARE_ACCESS_DENIED", DENIED_MESSAGE, HttpStatus.FORBIDDEN);
  }
}
