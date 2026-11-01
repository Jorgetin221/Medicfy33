import { randomBytes } from "node:crypto";
import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import type { Doctor } from "@prisma/client";
import { isMinor, normalizeEmail, type ShareRequestCreateInput, type ShareRequestSummary } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { AuditService } from "../../identity/services/audit.service";
import type { RequestMeta } from "../../identity/services/auth.service";
import { CareRelationshipService } from "../../scheduling/services/care-relationship.service";
import { normalizeMxPhoneToE164, normalizePersonName } from "../patient-identity-normalizer.util";
import { RECORD_SHARE_NOTIFICATION_PORT, type RecordShareNotificationPort } from "../record-share-notification.port";
import { sha256Hex } from "../record-share-crypto.util";
import { doctorDisplayName } from "../record-share-display.util";
import { safeErrorLabel } from "../record-share-log.util";
import { recordShareWebOrigin } from "../record-share-web-origin.util";

const DAILY_REQUEST_LIMIT = 20;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const REJECTION_COOLDOWN_MS = 7 * ONE_DAY_MS;
const LINK_TTL_MS = 72 * 60 * 60 * 1000;

// RE5 (sin enumeración) + el mandato del prompt maestro de que "la
// búsqueda y el envío corren en un trabajo asíncrono": esta es la
// respuesta SIEMPRE idéntica — nunca cambia según si hubo o no
// coincidencia, para que ni el cuerpo ni el tiempo de respuesta lo
// revelen (ver 02-solicitud-del-medico.md §1 para la razón completa,
// incluida la decisión de que el límite de 7 días tras un rechazo
// también vive aquí dentro, no como un error visible).
const GENERIC_RESPONSE = {
  message: "Si los datos coinciden con un expediente en Medicfy, el paciente recibirá un mensaje para autorizar tu solicitud.",
};

@Injectable()
export class RecordShareRequestService {
  private readonly logger = new Logger(RecordShareRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly careRelationshipService: CareRelationshipService,
    @Inject(RECORD_SHARE_NOTIFICATION_PORT) private readonly notifications: RecordShareNotificationPort
  ) {}

  /**
   * RE5: valida y responde en el MISMO tiempo exista o no coincidencia
   * — la búsqueda y el envío (processMatchAndNotify) se disparan sin
   * esperarlos. Solo lo que NO depende del paciente (verificación del
   * médico vía guard, forma del DTO, límite diario) puede bloquear
   * esta respuesta; cualquier otra regla vive dentro del trabajo
   * asíncrono.
   */
  async requestAccess(requesterUserId: string, input: ShareRequestCreateInput, meta: RequestMeta): Promise<typeof GENERIC_RESPONSE> {
    const requester = await this.prisma.doctor.findUniqueOrThrow({
      where: { userId: requesterUserId },
      include: { primarySpecialty: true },
    });

    await this.enforceDailyLimit(requester.id, requesterUserId, meta);

    void this.processMatchAndNotify(requester, input).catch((error: unknown) => {
      // No debe tirar el proceso ni, sobre todo, escapar hacia la
      // respuesta HTTP (ya se envió) — R2: el error de Prisma puede
      // traer valores de la consulta, así que nunca se loggea tal cual.
      this.logger.error(`record-share matchAndNotify failed: ${safeErrorLabel(error)}`);
    });

    return GENERIC_RESPONSE;
  }

  async listMine(requesterUserId: string): Promise<ShareRequestSummary[]> {
    const requester = await this.prisma.doctor.findUniqueOrThrow({ where: { userId: requesterUserId } });
    const requests = await this.prisma.recordShareRequest.findMany({
      where: { requesterDoctorId: requester.id },
      orderBy: { createdAt: "desc" },
    });
    return requests.map((r) => ({
      id: r.id,
      status: r.status,
      requestedScope: r.requestedScope,
      requestedDurationDays: r.requestedDurationDays,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
    }));
  }

  async cancel(requesterUserId: string, requestId: string, meta: RequestMeta): Promise<void> {
    const requester = await this.prisma.doctor.findUniqueOrThrow({ where: { userId: requesterUserId } });
    const updated = await this.prisma.recordShareRequest.updateMany({
      where: { id: requestId, requesterDoctorId: requester.id, status: "PENDING_PATIENT" },
      data: { status: "CANCELLED_BY_REQUESTER" },
    });
    if (updated.count !== 1) {
      // Genérico a propósito: no distingue "no es tuya" de "ya no está
      // pendiente" de "no existe" — mismo espíritu de RE5 aplicado a
      // esta ruta (el médico ya conoce esta solicitud porque es suya,
      // pero no hace falta revelarle el motivo exacto del rechazo).
      throw new ApiException("RECORD_SHARE_REQUEST_NOT_CANCELLABLE", "No se pudo cancelar la solicitud.", HttpStatus.BAD_REQUEST);
    }
    await this.auditService.log({
      actorUserId: requesterUserId,
      actorRole: "DOCTOR",
      action: "SHARE_REQUEST_CANCELLED",
      resourceType: "record_share_request",
      resourceId: requestId,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  // Sección B: 20/día. Independiente del paciente (no viola RE5) — el
  // conteo usa audit_log (acción SHARE_REQUESTED, actor = este
  // médico) en vez de contar filas de record_share_requests, porque
  // esas filas SOLO se crean cuando hay coincidencia (ver
  // processMatchAndNotify) — contar filas dejaría sin límite a quien
  // solo prueba pacientes que no existen. El SHARE_REQUESTED de aquí
  // se escribe SIEMPRE, antes de responder, sin importar si luego hay
  // coincidencia — es lo que cuenta este límite y lo que satisface
  // "todo evento queda en audit_log" para el caso base.
  private async enforceDailyLimit(requesterDoctorId: string, requesterUserId: string, meta: RequestMeta): Promise<void> {
    const since = new Date(Date.now() - ONE_DAY_MS);
    const countToday = await this.prisma.auditLog.count({
      where: { actorUserId: requesterUserId, action: "SHARE_REQUESTED", occurredAt: { gte: since } },
    });
    if (countToday >= DAILY_REQUEST_LIMIT) {
      await this.auditService.log({
        actorUserId: requesterUserId,
        actorRole: "DOCTOR",
        action: "SHARE_REQUEST_LIMIT_REACHED",
        resourceType: "record_share_request",
        result: "DENIED",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new ApiException(
        "RECORD_SHARE_REQUEST_LIMIT_REACHED",
        "Alcanzaste el límite de solicitudes de expediente compartido por hoy.",
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    await this.auditService.log({
      actorUserId: requesterUserId,
      actorRole: "DOCTOR",
      action: "SHARE_REQUESTED",
      resourceType: "record_share_request",
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  // Todo lo de aquí abajo es SILENCIOSO para el médico (RE5): cada
  // return temprano es un caso en el que no se crea ninguna
  // record_share_request, pero la respuesta HTTP (ya enviada) nunca
  // lo distingue. SHARE_NO_MATCH agrupa todos esos casos con la razón
  // real en metadata — visible solo para quien audita, nunca por la API.
  private async processMatchAndNotify(requester: Doctor & { primarySpecialty: { nameEs: string } | null }, input: ShareRequestCreateInput): Promise<void> {
    const normalizedFirstName = normalizePersonName(input.patient.firstName);
    const normalizedLastNamePaternal = normalizePersonName(input.patient.lastNamePaternal);
    const normalizedLastNameMaternal = input.patient.lastNameMaternal ? normalizePersonName(input.patient.lastNameMaternal) : null;
    const normalizedPhone = input.patient.phone ? normalizeMxPhoneToE164(input.patient.phone) : null;
    const normalizedEmail = input.patient.email ? normalizeEmail(input.patient.email) : null;

    if (!normalizedPhone && !normalizedEmail) {
      // El teléfono/correo no se pudo normalizar a algo comparable
      // (p. ej. un teléfono con dígitos insuficientes) — nunca se
      // intenta adivinar, se trata como cualquier otra no-coincidencia.
      await this.logNoMatch(requester, "unnormalizable_contact");
      return;
    }

    const candidates = await this.prisma.patient.findMany({
      where: {
        birthDate: new Date(`${input.patient.birthDate}T00:00:00Z`),
        OR: [
          ...(normalizedPhone ? [{ phoneE164: normalizedPhone }] : []),
          ...(normalizedEmail ? [{ email: { equals: normalizedEmail, mode: "insensitive" as const } }] : []),
        ],
      },
    });

    const matches = candidates.filter((candidate) => {
      if (normalizePersonName(candidate.firstName) !== normalizedFirstName) return false;
      if (normalizePersonName(candidate.lastNamePaternal) !== normalizedLastNamePaternal) return false;
      if (normalizedLastNameMaternal) {
        if (normalizePersonName(candidate.lastNameMaternal ?? "") !== normalizedLastNameMaternal) return false;
      }
      return true;
    });

    // Patient es global (00-DESCUBRIMIENTO.md Q1): nunca debería haber
    // más de una fila real. Si por lo que sea hay más de una, se trata
    // como ninguna — adivinar cuál es la correcta es peor que no
    // encontrar nada.
    if (matches.length !== 1) {
      await this.logNoMatch(requester, matches.length === 0 ? "no_match" : "ambiguous_match");
      return;
    }
    const [patient] = matches;
    if (!patient) {
      // Inalcanzable (ya se validó matches.length === 1 arriba) — solo
      // para que noUncheckedIndexedAccess no deje `patient` como
      // posiblemente undefined en todo lo de abajo.
      await this.logNoMatch(requester, "no_match");
      return;
    }

    // D-EXP-10: la excepción ("salvo tutor con contacto verificado")
    // no tiene cómo cumplirse hoy — PatientGuardian no tiene ningún
    // campo de verificación de contacto (00-DESCUBRIMIENTO.md Q11).
    // PENDIENTE(jorge): cuando exista esa verificación, aquí se
    // vuelve a revisar antes de bloquear. Ref: D-EXP-10.
    if (isMinor(patient.birthDate)) {
      await this.logNoMatch(requester, "minor_blocked", patient.id);
      return;
    }

    const activeCustodians = await this.careRelationshipService.listActiveDoctorsForPatient(patient.id);

    if (activeCustodians.some((doctor) => doctor.id === requester.id)) {
      // "No se crea solicitud si el solicitante ya tiene relación de
      // cuidado directa con ese paciente" — para NINGÚN custodio, no
      // solo para sí mismo.
      await this.logNoMatch(requester, "already_related", patient.id);
      return;
    }

    const recentDenial = await this.prisma.recordShareConsent.findFirst({
      where: { decision: "DENIED", request: { requesterDoctorId: requester.id, patientId: patient.id } },
      orderBy: { decidedAt: "desc" },
    });
    if (recentDenial && Date.now() - recentDenial.decidedAt.getTime() < REJECTION_COOLDOWN_MS) {
      await this.logNoMatch(requester, "recent_denial_cooldown", patient.id);
      return;
    }

    if (activeCustodians.length === 0) {
      await this.logNoMatch(requester, "no_active_custodian", patient.id);
      return;
    }

    const requesterDisplayName = doctorDisplayName(requester);
    // ⚠️ Decisión por defecto (02-solicitud-del-medico.md §3): EMAIL,
    // porque Patient.phoneE164/email son siempre obligatorios (nunca
    // faltan) y no hay todavía ningún adaptador real de SMS/WhatsApp.
    const channel = "EMAIL" as const;
    const destination = patient.email;

    for (const custodian of activeCustodians) {
      const plainToken = randomBytes(32).toString("base64url");
      const request = await this.prisma.recordShareRequest.create({
        data: {
          requesterDoctorId: requester.id,
          custodianDoctorId: custodian.id,
          patientId: patient.id,
          reason: input.reason,
          requestedScope: input.scope,
          requestedDurationDays: input.durationDays,
          linkTokenHash: sha256Hex(plainToken),
          expiresAt: new Date(Date.now() + LINK_TTL_MS),
        },
      });

      await this.auditService.log({
        actorUserId: requester.userId,
        actorRole: "DOCTOR",
        action: "SHARE_REQUESTED",
        resourceType: "record_share_request",
        resourceId: request.id,
        patientId: patient.id,
        result: "SUCCESS",
        metadata: { custodianDoctorId: custodian.id },
      });

      const authorizationUrl = `${recordShareWebOrigin()}/expediente-compartido/autorizar/${plainToken}`;
      await this.notifications.sendAuthorizationRequest({
        channel,
        destination,
        requesterDisplayName,
        requesterLicense: requester.professionalLicense,
        requesterSpecialtyName: requester.primarySpecialty?.nameEs ?? null,
        authorizationUrl,
      });
    }
  }

  private async logNoMatch(requester: Doctor, reason: string, patientId?: string): Promise<void> {
    await this.auditService.log({
      actorUserId: requester.userId,
      action: "SHARE_NO_MATCH",
      resourceType: "record_share_request",
      ...(patientId ? { patientId } : {}),
      result: "SUCCESS",
      metadata: { reason },
    });
  }
}
