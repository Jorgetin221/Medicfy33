import { HttpStatus, Injectable } from "@nestjs/common";
import type { Patient } from "@prisma/client";
import type { PatientShareGrantItem, PatientShareRequestItem, RecordShareDecisionInput } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { AuditService } from "../../identity/services/audit.service";
import type { RequestMeta } from "../../identity/services/auth.service";
import { RECORD_SHARE_CONSENT_VERSION, consentOptionsFor, requesterLegalName } from "../record-share-consent-text";
import { doctorDisplayName } from "../record-share-display.util";
import { RecordShareAuthorizationService } from "./record-share-authorization.service";
import { RecordShareRevocationService } from "./record-share-revocation.service";

// Cuántos accesos ya terminados (vencidos, revocados, suspendidos) se
// muestran junto a los vigentes — historial corto, no bitácora.
const RECENT_FINISHED_GRANTS = 10;

/**
 * Bandeja del paciente CON CUENTA (campana en /mi-cuenta). Decisión del
 * usuario (2026-11-02): la solicitud de compartir el expediente le llega
 * dentro de su cuenta y la decide con su sesión iniciada — la sesión es
 * la prueba de identidad que antes daba el código por correo. Las reglas
 * de la decisión son EXACTAMENTE las de la página pública
 * (RecordShareAuthorizationService.applyDecision); aquí solo cambia cómo
 * se acredita quién decide, y queda como method = PATIENT_SESSION.
 *
 * Todo se resuelve por el usuario de la sesión: nunca por un patientId
 * del cuerpo o de la URL (mismo criterio que /patients/me).
 */
@Injectable()
export class RecordSharePatientInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly authorization: RecordShareAuthorizationService,
    private readonly revocation: RecordShareRevocationService
  ) {}

  async listPendingRequests(userId: string): Promise<PatientShareRequestItem[]> {
    const patient = await this.findOwnPatient(userId);
    if (!patient) return [];
    // PENDING_CUSTODIAN también se muestra (ya autorizó; falta su
    // médico), pero sin acción del paciente.
    const now = new Date();
    const requests = await this.prisma.recordShareRequest.findMany({
      where: { patientId: patient.id, status: { in: ["PENDING_PATIENT", "PENDING_CUSTODIAN"] }, expiresAt: { gt: now } },
      include: { requesterDoctor: { include: { primarySpecialty: true } }, custodianDoctor: true },
      orderBy: { createdAt: "desc" },
    });
    return requests.map((request) => ({
      id: request.id,
      requesterDisplayName: doctorDisplayName(request.requesterDoctor),
      requesterLicense: request.requesterDoctor.professionalLicense,
      requesterSpecialtyName: request.requesterDoctor.primarySpecialty?.nameEs ?? null,
      custodianDisplayName: doctorDisplayName(request.custodianDoctor),
      reason: request.reason,
      requestedScope: request.requestedScope,
      requestedDurationDays: request.requestedDurationDays,
      consentTextVersion: RECORD_SHARE_CONSENT_VERSION,
      consentOptions: consentOptionsFor(request.requestedDurationDays, requesterLegalName(request.requesterDoctor), now),
      createdAt: request.createdAt.toISOString(),
      expiresAt: request.expiresAt.toISOString(),
      awaitingCustodian: request.status === "PENDING_CUSTODIAN",
    }));
  }

  async decide(userId: string, requestId: string, input: RecordShareDecisionInput, meta: RequestMeta) {
    const patient = await this.findOwnPatient(userId);
    const request = patient
      ? await this.prisma.recordShareRequest.findFirst({
          where: { id: requestId, patientId: patient.id, status: "PENDING_PATIENT", expiresAt: { gt: new Date() } },
        })
      : null;
    if (!request) {
      // 404 genérico: no distingue "no es tuya" de "ya no está pendiente".
      await this.auditService.log({
        actorUserId: userId,
        actorRole: "PATIENT",
        action: "SHARE_DECISION_DENIED",
        resourceType: "record_share_request",
        resourceId: requestId,
        result: "DENIED",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: { reason: "no_pendiente_o_ajena" },
      });
      throw new ApiException("RECORD_SHARE_REQUEST_NOT_FOUND", "Esta solicitud ya no está disponible.", HttpStatus.NOT_FOUND);
    }
    return this.authorization.applyDecision(request.id, input, meta, {
      method: "PATIENT_SESSION",
      channel: null,
      actorUserId: userId,
    });
  }

  async listGrants(userId: string): Promise<PatientShareGrantItem[]> {
    const patient = await this.findOwnPatient(userId);
    if (!patient) return [];
    const include = { requesterDoctor: true, custodianDoctor: true } as const;
    const [active, finished] = await Promise.all([
      this.prisma.recordShareGrant.findMany({
        where: { patientId: patient.id, status: "ACTIVE", expiresAt: { gt: new Date() } },
        include,
        orderBy: { startsAt: "desc" },
      }),
      this.prisma.recordShareGrant.findMany({
        where: { patientId: patient.id, OR: [{ status: { not: "ACTIVE" } }, { expiresAt: { lte: new Date() } }] },
        include,
        orderBy: { startsAt: "desc" },
        take: RECENT_FINISHED_GRANTS,
      }),
    ]);
    const grants = [...active, ...finished];
    // "Quedará registrado, y podrás ver cuándo lo consultó": mismas
    // consultas que ve el médico tratante (audit_log SHARE_VIEWED).
    const viewEvents = grants.length
      ? await this.prisma.auditLog.findMany({
          where: { resourceType: "record_share_grant", resourceId: { in: grants.map((g) => g.id) }, action: "SHARE_VIEWED", result: "SUCCESS" },
          select: { resourceId: true, occurredAt: true },
          orderBy: { occurredAt: "desc" },
        })
      : [];
    return grants.map((grant) => ({
      id: grant.id,
      requesterDisplayName: doctorDisplayName(grant.requesterDoctor),
      requesterLicense: grant.requesterDoctor.professionalLicense,
      custodianDisplayName: doctorDisplayName(grant.custodianDoctor),
      scope: grant.scope,
      startsAt: grant.startsAt.toISOString(),
      expiresAt: grant.expiresAt.toISOString(),
      // Vencido por fecha aunque el barrido aún no lo haya marcado.
      status: grant.status === "ACTIVE" && grant.expiresAt <= new Date() ? "EXPIRED" : grant.status,
      revokedAt: grant.revokedAt?.toISOString() ?? null,
      views: viewEvents.filter((e) => e.resourceId === grant.id).map((e) => ({ viewedAt: e.occurredAt.toISOString() })),
    }));
  }

  async revoke(userId: string, grantId: string, meta: RequestMeta): Promise<{ revoked: true }> {
    const patient = await this.findOwnPatient(userId);
    if (!patient) {
      throw new ApiException("RECORD_SHARE_GRANT_NOT_ACTIVE", "Ese acceso ya no está vigente.", HttpStatus.NOT_FOUND);
    }
    return this.revocation.revokeFromPatientAccount(userId, patient.id, grantId, meta);
  }

  private findOwnPatient(userId: string): Promise<Patient | null> {
    return this.prisma.patient.findUnique({ where: { userId } });
  }
}
