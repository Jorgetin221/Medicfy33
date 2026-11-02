import { HttpStatus, Injectable } from "@nestjs/common";
import type { Doctor, RecordShareConsent, RecordShareGrant, RecordShareRequest } from "@prisma/client";
import type { CustodianShareDecisionInput, CustodianShareRequestItem } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { AuditService } from "../../identity/services/audit.service";
import type { RequestMeta } from "../../identity/services/auth.service";
import { doctorDisplayName, patientFullName } from "../record-share-display.util";
import { lockPendingRequest } from "../record-share-request-lock.util";
import { RecordShareAuthorizationService, type RecordShareDecisionOutcome } from "./record-share-authorization.service";
import { RecordShareDoctorNotifierService } from "./record-share-doctor-notifier.service";

const PENDING_STATUSES = ["PENDING_PATIENT", "PENDING_CUSTODIAN"] as const;

function requestNotFound(): ApiException {
  return new ApiException("RECORD_SHARE_REQUEST_NOT_FOUND", "Esta solicitud ya no está disponible.", HttpStatus.NOT_FOUND);
}

type CustodianDecisionResult =
  | { status: "DENIED"; request: RecordShareRequest }
  | { status: "PENDING_PATIENT"; request: RecordShareRequest }
  | { status: "APPROVED"; request: RecordShareRequest; grant: RecordShareGrant; consent: RecordShareConsent; revokeToken: string };

/**
 * Doble autorización (decisión del usuario, 2026-11-02): además del
 * paciente, el médico TRATANTE (custodio) debe aprobar que otro médico
 * vea el expediente de su paciente. Pueden decidir en cualquier orden;
 * el acceso se crea cuando aprueba el segundo, y si cualquiera rechaza
 * la solicitud queda DENIED (para el solicitante se ve igual que
 * cualquier "no autorizada" — RE5).
 *
 * Solo el médico en persona, nunca su asistente: es una decisión sobre
 * la información clínica de su paciente.
 */
@Injectable()
export class RecordShareCustodianApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly authorization: RecordShareAuthorizationService,
    private readonly doctorNotifier: RecordShareDoctorNotifierService
  ) {}

  async listPending(userId: string, meta: RequestMeta): Promise<CustodianShareRequestItem[]> {
    const custodian = await this.resolveCustodian(userId);
    const requests = await this.prisma.recordShareRequest.findMany({
      where: {
        custodianDoctorId: custodian.id,
        custodianDecision: "PENDING",
        status: { in: [...PENDING_STATUSES] },
        expiresAt: { gt: new Date() },
      },
      include: { requesterDoctor: { include: { primarySpecialty: true } }, patient: true },
      orderBy: { createdAt: "desc" },
    });
    // R3: el médico ve el nombre de su paciente — lectura registrada.
    for (const request of requests) {
      await this.auditService.log({
        actorUserId: userId,
        actorRole: "DOCTOR",
        action: "SHARE_CUSTODIAN_INBOX_READ",
        resourceType: "record_share_request",
        resourceId: request.id,
        patientId: request.patientId,
        result: "SUCCESS",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
    }
    return requests.map((request) => ({
      id: request.id,
      patientId: request.patientId,
      patientName: patientFullName(request.patient),
      patientMedicfyId: request.patient.medicfyId,
      requesterDisplayName: doctorDisplayName(request.requesterDoctor),
      requesterLicense: request.requesterDoctor.professionalLicense,
      requesterSpecialtyName: request.requesterDoctor.primarySpecialty?.nameEs ?? null,
      reason: request.reason,
      requestedScope: request.requestedScope,
      requestedDurationDays: request.requestedDurationDays,
      patientApproved: request.status === "PENDING_CUSTODIAN",
      createdAt: request.createdAt.toISOString(),
      expiresAt: request.expiresAt.toISOString(),
    }));
  }

  async decide(
    userId: string,
    requestId: string,
    input: CustodianShareDecisionInput,
    meta: RequestMeta
  ): Promise<{ status: RecordShareDecisionOutcome | "PENDING_PATIENT" }> {
    const custodian = await this.resolveCustodian(userId);
    const now = new Date();

    const result: CustodianDecisionResult = await this.prisma.$transaction(async (tx) => {
      const request = await lockPendingRequest(tx, requestId, [...PENDING_STATUSES]).catch(() => {
        throw requestNotFound();
      });
      if (request.custodianDoctorId !== custodian.id || request.custodianDecision !== "PENDING") throw requestNotFound();
      const decided = { custodianDecision: input.decision, custodianDecidedAt: now, custodianDecidedByUserId: userId };

      if (input.decision === "DENIED") {
        await tx.recordShareRequest.update({ where: { id: request.id }, data: { ...decided, status: "DENIED" } });
        return { status: "DENIED", request };
      }
      if (request.status === "PENDING_PATIENT") {
        // El paciente aún no decide: queda la aprobación del médico y el
        // acceso se creará cuando el paciente autorice.
        await tx.recordShareRequest.update({ where: { id: request.id }, data: decided });
        return { status: "PENDING_PATIENT", request };
      }
      const consent = await tx.recordShareConsent.findUniqueOrThrow({ where: { requestId: request.id } });
      const created = await this.authorization.createGrantInTx(tx, request, consent);
      await tx.recordShareRequest.update({ where: { id: request.id }, data: { ...decided, status: "APPROVED" } });
      return { status: "APPROVED", request, consent, ...created };
    });

    await this.auditService.log({
      actorUserId: userId,
      actorRole: "DOCTOR",
      action: input.decision === "DENIED" ? "SHARE_CUSTODIAN_DENIED" : "SHARE_CUSTODIAN_APPROVED",
      resourceType: "record_share_request",
      resourceId: result.request.id,
      patientId: result.request.patientId,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    if (result.status === "DENIED") {
      // RE5: el solicitante recibe el mismo aviso que con cualquier
      // negativa o vencimiento.
      await this.doctorNotifier.notAuthorized(result.request);
    } else if (result.status === "APPROVED") {
      await this.auditService.log({
        actorUserId: userId,
        actorRole: "DOCTOR",
        action: "SHARE_APPROVED",
        resourceType: "record_share_request",
        resourceId: result.request.id,
        patientId: result.request.patientId,
        result: "SUCCESS",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      await this.authorization.afterGrantCreated(result.grant, result.consent, result.revokeToken);
    }
    return { status: result.status };
  }

  private async resolveCustodian(userId: string): Promise<Doctor> {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    if (!doctor) {
      throw new ApiException(
        "RECORD_SHARE_CUSTODIAN_ONLY",
        "Solo el médico tratante puede autorizar que se comparta el expediente de su paciente.",
        HttpStatus.FORBIDDEN
      );
    }
    return doctor;
  }
}
