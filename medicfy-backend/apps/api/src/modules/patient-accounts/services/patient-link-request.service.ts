import { HttpStatus, Injectable } from "@nestjs/common";
import type { Patient, PatientLinkRequest } from "@prisma/client";
import type { OwnPatientLinkStatus, PatientIdentityData, PatientLinkRequestView } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { AuditService } from "../../identity/services/audit.service";
import type { RequestMeta } from "../../identity/services/auth.service";
import type { PatientAccountActor } from "../patient-account-access.service";
import { PatientAccountAccessService } from "../patient-account-access.service";

type RequestWithPatient = PatientLinkRequest & { patient: Patient };

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function recordIdentity(patient: Patient): PatientIdentityData {
  return {
    firstName: patient.firstName,
    lastNamePaternal: patient.lastNamePaternal,
    lastNameMaternal: patient.lastNameMaternal,
    birthDate: toDateKey(patient.birthDate),
    sexAtBirth: patient.sexAtBirth,
    phoneE164: patient.phoneE164,
    email: patient.email,
  };
}

function claimedIdentity(request: PatientLinkRequest): PatientIdentityData {
  return {
    firstName: request.claimedFirstName,
    lastNamePaternal: request.claimedLastNamePaternal,
    lastNameMaternal: request.claimedLastNameMaternal,
    birthDate: toDateKey(request.claimedBirthDate),
    sexAtBirth: request.claimedSexAtBirth,
    phoneE164: request.claimedPhoneE164,
    email: request.claimedEmail,
  };
}

function toView(request: RequestWithPatient): PatientLinkRequestView {
  return {
    id: request.id,
    patientId: request.patientId,
    medicfyId: request.patient.medicfyId,
    status: request.status,
    createdAt: request.createdAt.toISOString(),
    claimed: claimedIdentity(request),
    record: recordIdentity(request.patient),
  };
}

function requestAlreadyResolved(): ApiException {
  return new ApiException("PATIENT_LINK_REQUEST_RESOLVED", "Esta solicitud ya fue resuelta.", HttpStatus.CONFLICT);
}

// Parte 2 — solicitudes de vinculación que se crean cuando alguien se
// registra solo y su teléfono coincide con expedientes sin cuenta (ver
// AuthService.registerPatient). Solo el médico tratante las ve y las
// decide; la persona que se registró nunca sabe cuál expediente
// coincidió.
@Injectable()
export class PatientLinkRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly access: PatientAccountAccessService
  ) {}

  async listPendingForDoctor(actor: PatientAccountActor): Promise<PatientLinkRequestView[]> {
    const requests = await this.prisma.patientLinkRequest.findMany({
      where: {
        status: "PENDING",
        patient: {
          userId: null,
          careRelationships: { some: { doctorId: actor.doctor.id, status: "ACTIVE", expiresAt: { gt: new Date() } } },
        },
      },
      include: { patient: true },
      orderBy: { createdAt: "asc" },
    });
    await this.logReads(requests, actor);
    return requests.map(toView);
  }

  async listPendingForPatient(patientId: string, actor: PatientAccountActor): Promise<PatientLinkRequestView[]> {
    const patient = await this.access.findPatientForActor(patientId, actor, "patient.link_request.read");
    const requests = await this.prisma.patientLinkRequest.findMany({
      where: { patientId: patient.id, status: "PENDING" },
      include: { patient: true },
      orderBy: { createdAt: "asc" },
    });
    await this.logReads(requests, actor);
    return requests.map(toView);
  }

  // Aprobar: vincula User y Patient en una transacción y cierra todas
  // las demás solicitudes del mismo User o del mismo Patient, más
  // cualquier enlace de activación pendiente del expediente (ya tiene
  // cuenta).
  async approve(requestId: string, actor: PatientAccountActor, meta: RequestMeta): Promise<void> {
    const request = await this.findRequestForActor(requestId, actor, "patient.link_request.approved");
    if (request.status !== "PENDING") throw requestAlreadyResolved();

    const { cancelled, revokedLinkIds } = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const decided = await tx.patientLinkRequest.updateMany({
        where: { id: request.id, status: "PENDING" },
        data: { status: "APPROVED", decidedAt: now, decidedByUserId: actor.userId },
      });
      if (decided.count !== 1) throw requestAlreadyResolved();

      const alreadyLinkedUser = await tx.patient.findUnique({ where: { userId: request.userId }, select: { id: true } });
      if (alreadyLinkedUser) {
        throw new ApiException(
          "PATIENT_LINK_USER_ALREADY_LINKED",
          "Esta cuenta ya está vinculada a otro expediente.",
          HttpStatus.CONFLICT
        );
      }
      const linked = await tx.patient.updateMany({ where: { id: request.patientId, userId: null }, data: { userId: request.userId } });
      if (linked.count !== 1) {
        throw new ApiException("PATIENT_ALREADY_HAS_ACCOUNT", "Este paciente ya tiene una cuenta activa.", HttpStatus.CONFLICT);
      }

      const others = await tx.patientLinkRequest.findMany({
        where: { status: "PENDING", id: { not: request.id }, OR: [{ userId: request.userId }, { patientId: request.patientId }] },
        select: { id: true, patientId: true },
      });
      if (others.length > 0) {
        await tx.patientLinkRequest.updateMany({
          where: { id: { in: others.map((o) => o.id) }, status: "PENDING" },
          data: { status: "CANCELLED", decidedAt: now, decidedByUserId: actor.userId },
        });
      }
      const pendingLinks = await tx.patientActivationLink.findMany({
        where: { patientId: request.patientId, status: "PENDING" },
        select: { id: true },
      });
      if (pendingLinks.length > 0) {
        await tx.patientActivationLink.updateMany({
          where: { id: { in: pendingLinks.map((l) => l.id) }, status: "PENDING" },
          data: { status: "REVOKED", revokedAt: now, revokedByUserId: actor.userId },
        });
      }
      return { cancelled: others, revokedLinkIds: pendingLinks.map((l) => l.id) };
    });

    await this.logDecision("patient.link_request.approved", request.id, request.patientId, actor, meta, {
      linkedUserId: request.userId,
    });
    for (const other of cancelled) {
      await this.logDecision("patient.link_request.cancelled", other.id, other.patientId, actor, meta, {
        reason: "other_request_approved",
      });
    }
    for (const linkId of revokedLinkIds) {
      await this.auditService.log({
        actorUserId: actor.userId,
        actorRole: "DOCTOR",
        action: "patient.activation_link.revoked",
        resourceType: "patient_activation_link",
        resourceId: linkId,
        patientId: request.patientId,
        result: "SUCCESS",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: { reason: "patient_linked_by_request" },
      });
    }
  }

  // Rechazar: la cuenta queda sin expediente vinculado. No se crea uno
  // nuevo en automático — ver docs/planes/20261102-vinculacion-cuentas-paciente.md.
  async reject(requestId: string, actor: PatientAccountActor, meta: RequestMeta): Promise<void> {
    const request = await this.findRequestForActor(requestId, actor, "patient.link_request.rejected");
    const decided = await this.prisma.patientLinkRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: { status: "REJECTED", decidedAt: new Date(), decidedByUserId: actor.userId },
    });
    if (decided.count !== 1) throw requestAlreadyResolved();
    await this.logDecision("patient.link_request.rejected", request.id, request.patientId, actor, meta, {});
  }

  // Lo único que el propio paciente puede saber: si ya tiene expediente,
  // si está pendiente o nada. Nunca cuál, de quién ni cuántos.
  async ownStatus(userId: string): Promise<OwnPatientLinkStatus> {
    const patient = await this.prisma.patient.findUnique({ where: { userId }, select: { id: true } });
    if (patient) return "LINKED";
    const pending = await this.prisma.patientLinkRequest.count({ where: { userId, status: "PENDING" } });
    return pending > 0 ? "PENDING_REVIEW" : "NONE";
  }

  private async findRequestForActor(requestId: string, actor: PatientAccountActor, action: string): Promise<RequestWithPatient> {
    const request = await this.prisma.patientLinkRequest.findUnique({ where: { id: requestId }, include: { patient: true } });
    if (!request) {
      await this.auditService.log({
        actorUserId: actor.userId,
        action,
        resourceType: "patient_link_request",
        resourceId: requestId,
        result: "DENIED",
        metadata: { reason: "inexistente" },
      });
      throw new ApiException("PATIENT_LINK_REQUEST_NOT_FOUND", "Solicitud no encontrada.", HttpStatus.NOT_FOUND);
    }
    await this.access.findPatientForActor(request.patientId, actor, action).catch(() => {
      throw new ApiException("PATIENT_LINK_REQUEST_NOT_FOUND", "Solicitud no encontrada.", HttpStatus.NOT_FOUND);
    });
    return request;
  }

  private async logReads(requests: RequestWithPatient[], actor: PatientAccountActor): Promise<void> {
    for (const request of requests) {
      await this.auditService.log({
        actorUserId: actor.userId,
        action: "patient.link_request.read",
        resourceType: "patient_link_request",
        resourceId: request.id,
        patientId: request.patientId,
        result: "SUCCESS",
      });
    }
  }

  private async logDecision(
    action: string,
    requestId: string,
    patientId: string,
    actor: PatientAccountActor,
    meta: RequestMeta,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await this.auditService.log({
      actorUserId: actor.userId,
      actorRole: "DOCTOR",
      action,
      resourceType: "patient_link_request",
      resourceId: requestId,
      patientId,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata,
    });
  }
}
