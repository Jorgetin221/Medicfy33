import { randomBytes, randomInt } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Prisma, RecordShareRequest } from "@prisma/client";
import {
  SENSITIVE_CATEGORIES,
  type RecordShareAuthorizationInfo,
  type RecordShareDecisionInput,
} from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { AuditService } from "../../identity/services/audit.service";
import type { RequestMeta } from "../../identity/services/auth.service";
import { RECORD_SHARE_NOTIFICATION_PORT, type RecordShareNotificationPort } from "../record-share-notification.port";
import { sha256Hex, timingSafeEqualHex } from "../record-share-crypto.util";
import { RECORD_SHARE_CONSENT_TEXT, RECORD_SHARE_CONSENT_VERSION } from "../record-share-consent-text";
import { doctorDisplayName } from "../record-share-display.util";
import { RecordShareDoctorNotifierService } from "./record-share-doctor-notifier.service";
import { recordShareWebOrigin } from "../record-share-web-origin.util";

// Sección B (límites operativos por defecto).
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_RESENDS = 3;
const OTP_LOCKOUT_MS = 60 * 60 * 1000;
// "verifica el OTP, luego decide": ventana para que la decisión siga
// contando como verificada sin inventar un token puente nuevo (ver
// 03-autorizacion-del-paciente.md §5).
const OTP_VERIFIED_WINDOW_MS = 30 * 60 * 1000;

// Mensaje genérico para CUALQUIER enlace/token inválido u obsoleto —
// nunca distingue "no existe", "ya se respondió" o "venció": quien
// llega aquí ya tiene el enlace (no es un caso de enumeración de
// pacientes, RE5 no aplica a este mensaje en particular), pero tampoco
// hay nada que ganar siendo más específico.
const LINK_INVALID_MESSAGE = "Este enlace ya no es válido. Puede que haya vencido o que la solicitud ya se haya respondido.";

// Cómo se acreditó la identidad de quien decide — queda tal cual en
// record_share_consents (evidencia). OTP: página pública con código al
// correo del paciente. PATIENT_SESSION: el paciente decidió desde su
// propia cuenta, con sesión iniciada; no hubo canal externo.
export type RecordShareConsentEvidence =
  | { method: "OTP"; channel: "EMAIL" }
  | { method: "PATIENT_SESSION"; channel: null; actorUserId: string };

function requestNoLongerPending(): ApiException {
  return new ApiException("RECORD_SHARE_REQUEST_NOT_PENDING", "Esta solicitud ya no está pendiente.", HttpStatus.CONFLICT);
}

@Injectable()
export class RecordShareAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(RECORD_SHARE_NOTIFICATION_PORT) private readonly notifications: RecordShareNotificationPort,
    private readonly doctorNotifier: RecordShareDoctorNotifierService
  ) {}

  async getInfo(token: string): Promise<RecordShareAuthorizationInfo> {
    const request = await this.resolvePendingRequest(token);
    const requester = await this.prisma.doctor.findUniqueOrThrow({
      where: { id: request.requesterDoctorId },
      include: { primarySpecialty: true },
    });
    return {
      requesterDisplayName: doctorDisplayName(requester),
      requesterLicense: requester.professionalLicense,
      requesterSpecialtyName: requester.primarySpecialty?.nameEs ?? null,
      reason: request.reason,
      requestedScope: request.requestedScope,
      requestedDurationDays: request.requestedDurationDays,
      consentTextVersion: RECORD_SHARE_CONSENT_VERSION,
      consentText: RECORD_SHARE_CONSENT_TEXT,
    };
  }

  async requestOtp(token: string, meta: RequestMeta): Promise<void> {
    const request = await this.resolvePendingRequest(token);
    const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: request.patientId } });

    const existing = await this.prisma.recordShareChallenge.findFirst({
      where: { requestId: request.id, purpose: "AUTHORIZE" },
      orderBy: { createdAt: "desc" },
    });

    if (existing?.lockedUntil && existing.lockedUntil > new Date()) {
      throw new ApiException("RECORD_SHARE_OTP_LOCKED", "Demasiados intentos. Espera antes de pedir un código nuevo.", HttpStatus.TOO_MANY_REQUESTS);
    }
    if (existing && existing.resends >= OTP_MAX_RESENDS) {
      throw new ApiException("RECORD_SHARE_OTP_RESEND_LIMIT", "Ya alcanzaste el máximo de reenvíos. Espera a que el código actual expire.", HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const codeHash = sha256Hex(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    if (existing) {
      await this.prisma.recordShareChallenge.update({
        where: { id: existing.id },
        data: { codeHash, expiresAt, resends: { increment: 1 }, attempts: 0, consumedAt: null, lockedUntil: null },
      });
    } else {
      await this.prisma.recordShareChallenge.create({
        data: {
          requestId: request.id,
          channel: "EMAIL",
          // Q1 (00-DESCUBRIMIENTO.md): no hay "contacto del custodio",
          // solo el canal del Patient único.
          destinationRef: "PATIENT_EMAIL",
          codeHash,
          expiresAt,
        },
      });
    }

    await this.notifications.sendOtpCode({ channel: "EMAIL", destination: patient.email, code });
    await this.auditService.log({
      action: "SHARE_OTP_SENT",
      resourceType: "record_share_request",
      resourceId: request.id,
      patientId: request.patientId,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  async verifyOtp(token: string, code: string, meta: RequestMeta): Promise<void> {
    const request = await this.resolvePendingRequest(token);
    const challenge = await this.prisma.recordShareChallenge.findFirst({
      where: { requestId: request.id, purpose: "AUTHORIZE" },
      orderBy: { createdAt: "desc" },
    });

    const invalid = () =>
      new ApiException("RECORD_SHARE_OTP_INVALID", "Código inválido o vencido.", HttpStatus.BAD_REQUEST);

    if (!challenge) throw invalid();
    if (challenge.lockedUntil && challenge.lockedUntil > new Date()) {
      throw new ApiException("RECORD_SHARE_OTP_LOCKED", "Demasiados intentos. Espera antes de intentar de nuevo.", HttpStatus.TOO_MANY_REQUESTS);
    }
    // Un OTP ya usado o vencido falla igual que uno incorrecto — no
    // hay nada que distinguir para quien lo está tecleando.
    if (challenge.consumedAt || challenge.expiresAt < new Date()) throw invalid();

    if (!timingSafeEqualHex(sha256Hex(code), challenge.codeHash)) {
      const attempts = challenge.attempts + 1;
      const locked = attempts >= OTP_MAX_ATTEMPTS;
      await this.prisma.recordShareChallenge.update({
        where: { id: challenge.id },
        data: { attempts, ...(locked ? { lockedUntil: new Date(Date.now() + OTP_LOCKOUT_MS) } : {}) },
      });
      await this.auditService.log({
        action: locked ? "SHARE_OTP_LOCKED" : "SHARE_OTP_FAILED",
        resourceType: "record_share_request",
        resourceId: request.id,
        patientId: request.patientId,
        result: "DENIED",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      throw invalid();
    }

    await this.prisma.recordShareChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
  }

  async decide(token: string, input: RecordShareDecisionInput, meta: RequestMeta): Promise<{ status: "APPROVED" | "DENIED" }> {
    const request = await this.resolvePendingRequest(token);
    await this.assertOtpRecentlyVerified(request.id);
    return this.applyDecision(request, input, meta, { method: "OTP", channel: "EMAIL" });
  }

  // Núcleo compartido por la página pública (OTP) y la bandeja del
  // paciente con cuenta (PATIENT_SESSION). Quien llama ya verificó la
  // identidad; aquí se aplican las reglas de la decisión (RE1, "nunca
  // ampliar") y se guarda la evidencia.
  async applyDecision(
    request: RecordShareRequest,
    input: RecordShareDecisionInput,
    meta: RequestMeta,
    evidence: RecordShareConsentEvidence
  ): Promise<{ status: "APPROVED" | "DENIED" }> {
    const actorUserId = evidence.method === "PATIENT_SESSION" ? evidence.actorUserId : undefined;
    const consentTextSha256 = sha256Hex(RECORD_SHARE_CONSENT_TEXT);

    if (input.decision === "DENIED") {
      await this.prisma.$transaction(async (tx) => {
        await tx.recordShareConsent.create({
          data: {
            requestId: request.id,
            decision: "DENIED",
            approvedScope: [],
            durationDays: request.requestedDurationDays,
            consentTextVersion: RECORD_SHARE_CONSENT_VERSION,
            consentTextSha256,
            method: evidence.method,
            channel: evidence.channel,
            decidedAt: new Date(),
            ipAddress: meta.ip,
            userAgent: meta.userAgent,
          },
        });
        await this.markRequestDecided(tx, request.id, "DENIED");
      });
      await this.auditService.log({
        ...(actorUserId ? { actorUserId, actorRole: "PATIENT" } : {}),
        action: "SHARE_DENIED",
        resourceType: "record_share_request",
        resourceId: request.id,
        patientId: request.patientId,
        result: "SUCCESS",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      // PR-EXP-06/RE5: mismo aviso que "vencida sin respuesta".
      await this.doctorNotifier.notAuthorized(request);
      return { status: "DENIED" };
    }

    // §6: "nunca ampliar" — se revalida en el servidor, no solo en la
    // UI (prueba directa a la API, criterio de terminación de PR-EXP-03).
    const requestedScope = new Set(request.requestedScope);
    const scopeWithinRequest = input.approvedScope.every((s) => requestedScope.has(s));
    const includesSummary = input.approvedScope.includes("SUMMARY");
    if (!scopeWithinRequest || !includesSummary) {
      throw new ApiException("RECORD_SHARE_SCOPE_EXCEEDS_REQUEST", "El alcance autorizado no puede ampliar lo solicitado.", HttpStatus.UNPROCESSABLE_ENTITY);
    }
    if (input.durationDays > request.requestedDurationDays) {
      throw new ApiException("RECORD_SHARE_DURATION_EXCEEDS_REQUEST", "La duración autorizada no puede ampliar lo solicitado.", HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const excludedCategories = SENSITIVE_CATEGORIES.filter((c) => !input.includedSensitiveCategories.includes(c));
    const startsAt = new Date();
    const expiresAt = new Date(startsAt.getTime() + input.durationDays * 24 * 60 * 60 * 1000);
    // PR-EXP-06: enlace de revocación — solo el hash vive en la base.
    const revokeToken = randomBytes(32).toString("base64url");

    const grant = await this.prisma.$transaction(async (tx) => {
      const consent = await tx.recordShareConsent.create({
        data: {
          requestId: request.id,
          decision: "APPROVED",
          approvedScope: input.approvedScope,
          includedSensitiveCategories: input.includedSensitiveCategories,
          pregnancyExcluded: input.pregnancyExcluded,
          durationDays: input.durationDays,
          consentTextVersion: RECORD_SHARE_CONSENT_VERSION,
          consentTextSha256,
          method: evidence.method,
          channel: evidence.channel,
          decidedAt: startsAt,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
        },
      });
      const created = await tx.recordShareGrant.create({
        data: {
          consentId: consent.id,
          revokeTokenHash: sha256Hex(revokeToken),
          requesterDoctorId: request.requesterDoctorId,
          custodianDoctorId: request.custodianDoctorId,
          patientId: request.patientId,
          scope: input.approvedScope,
          excludedCategories,
          pregnancyExcluded: input.pregnancyExcluded,
          startsAt,
          expiresAt,
          status: "ACTIVE",
        },
      });
      await this.markRequestDecided(tx, request.id, "APPROVED");
      return created;
    });

    await this.auditService.log({
      ...(actorUserId ? { actorUserId, actorRole: "PATIENT" } : {}),
      action: "SHARE_APPROVED",
      resourceType: "record_share_request",
      resourceId: request.id,
      patientId: request.patientId,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    // Por la vía pública, la confirmación con el enlace de revocación
    // llega por el mismo canal que el código. Con cuenta no hay canal
    // externo: el paciente ve y revoca sus accesos dentro de su cuenta.
    if (evidence.method === "OTP") {
      const [patient, requester] = await Promise.all([
        this.prisma.patient.findUniqueOrThrow({ where: { id: request.patientId } }),
        this.prisma.doctor.findUniqueOrThrow({ where: { id: request.requesterDoctorId } }),
      ]);
      await this.notifications.sendApprovalConfirmation({
        channel: "EMAIL",
        destination: patient.email,
        requesterDisplayName: doctorDisplayName(requester),
        scope: input.approvedScope,
        expiresAt,
        revocationUrl: `${recordShareWebOrigin()}/expediente-compartido/revocar/${revokeToken}`,
      });
    }
    // PR-EXP-06: al solicitante (aprobada, con vencimiento) y al
    // custodio (aviso, sin el nombre del paciente — RE9).
    await this.doctorNotifier.approved(grant);
    await this.doctorNotifier.custodianNotice(grant);

    return { status: "APPROVED" };
  }

  // Compare-and-set: si el paciente decide dos veces a la vez (doble
  // clic, dos pestañas) o el barrido la venció en medio, solo una
  // transacción la cierra y la otra se revierte entera.
  private async markRequestDecided(tx: Prisma.TransactionClient, requestId: string, status: "APPROVED" | "DENIED"): Promise<void> {
    const { count } = await tx.recordShareRequest.updateMany({
      where: { id: requestId, status: "PENDING_PATIENT", expiresAt: { gt: new Date() } },
      data: { status },
    });
    if (count !== 1) throw requestNoLongerPending();
  }

  private async resolvePendingRequest(token: string): Promise<RecordShareRequest> {
    const request = await this.prisma.recordShareRequest.findUnique({ where: { linkTokenHash: sha256Hex(token) } });
    if (!request || request.status !== "PENDING_PATIENT" || request.expiresAt < new Date()) {
      throw new ApiException("RECORD_SHARE_LINK_INVALID", LINK_INVALID_MESSAGE, HttpStatus.NOT_FOUND);
    }
    return request;
  }

  private async assertOtpRecentlyVerified(requestId: string): Promise<void> {
    const verified = await this.prisma.recordShareChallenge.findFirst({
      where: { requestId, purpose: "AUTHORIZE", consumedAt: { gt: new Date(Date.now() - OTP_VERIFIED_WINDOW_MS) } },
      orderBy: { consumedAt: "desc" },
    });
    if (!verified) {
      throw new ApiException("RECORD_SHARE_OTP_NOT_VERIFIED", "Verifica el código antes de continuar.", HttpStatus.FORBIDDEN);
    }
  }
}
