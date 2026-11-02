import { randomBytes, randomInt } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Prisma, RecordShareConsent, RecordShareGrant, RecordShareRequest } from "@prisma/client";
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
import {
  RECORD_SHARE_CONSENT_VERSION,
  consentOptionsFor,
  renderRecordShareConsent,
  requesterLegalName,
} from "../record-share-consent-text";
import { lockPendingRequest } from "../record-share-request-lock.util";
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

// APPROVED: hay acceso. PENDING_CUSTODIAN: el paciente autorizó y falta
// su médico tratante. DENIED: rechazada.
export type RecordShareDecisionOutcome = "APPROVED" | "DENIED" | "PENDING_CUSTODIAN";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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
      consentOptions: consentOptionsFor(request.requestedDurationDays, requesterLegalName(requester), new Date()),
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

  async decide(token: string, input: RecordShareDecisionInput, meta: RequestMeta): Promise<{ status: RecordShareDecisionOutcome }> {
    const request = await this.resolvePendingRequest(token);
    await this.assertOtpRecentlyVerified(request.id);
    return this.applyDecision(request.id, input, meta, { method: "OTP", channel: "EMAIL" });
  }

  // Núcleo de la decisión DEL PACIENTE, compartido por la página pública
  // (OTP) y su bandeja con cuenta (PATIENT_SESSION). Quien llama ya
  // verificó la identidad. Doble autorización: si el médico tratante aún
  // no aprueba, la autorización del paciente queda guardada y la
  // solicitud pasa a PENDING_CUSTODIAN; el acceso se crea cuando aprueba
  // el segundo de los dos (ver RecordShareCustodianApprovalService).
  async applyDecision(
    requestId: string,
    input: RecordShareDecisionInput,
    meta: RequestMeta,
    evidence: RecordShareConsentEvidence
  ): Promise<{ status: RecordShareDecisionOutcome }> {
    const actorUserId = evidence.method === "PATIENT_SESSION" ? evidence.actorUserId : undefined;
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const request = await lockPendingRequest(tx, requestId, ["PENDING_PATIENT"]);
      const requester = await tx.doctor.findUniqueOrThrow({ where: { id: request.requesterDoctorId } });
      const requesterName = requesterLegalName(requester);
      const consentBase = {
        requestId: request.id,
        consentTextVersion: RECORD_SHARE_CONSENT_VERSION,
        method: evidence.method,
        channel: evidence.channel,
        decidedAt: now,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      };

      if (input.decision === "DENIED") {
        const rendered = renderRecordShareConsent(requesterName, request.requestedDurationDays, now);
        await tx.recordShareConsent.create({
          data: { ...consentBase, decision: "DENIED", approvedScope: [], durationDays: request.requestedDurationDays, consentTextSha256: rendered.sha256 },
        });
        await tx.recordShareRequest.update({ where: { id: request.id }, data: { status: "DENIED" } });
        return { status: "DENIED" as const, request };
      }

      this.assertWithinRequest(request, input);
      // El texto que leyó el paciente (nombre del médico + fecha de
      // vencimiento de ESTA duración) debe ser el que se guarda. Si la
      // fecha cambió entre que lo leyó y que aprobó (p. ej. pasó la
      // medianoche), se le pide revisarlo de nuevo.
      const rendered = renderRecordShareConsent(requesterName, input.durationDays, now);
      if (rendered.sha256 !== input.consentTextSha256) {
        throw new ApiException(
          "RECORD_SHARE_CONSENT_TEXT_CHANGED",
          "El texto de la autorización cambió. Revísalo de nuevo antes de aprobar.",
          HttpStatus.CONFLICT
        );
      }
      const consent = await tx.recordShareConsent.create({
        data: {
          ...consentBase,
          decision: "APPROVED",
          approvedScope: input.approvedScope,
          includedSensitiveCategories: input.includedSensitiveCategories,
          pregnancyExcluded: input.pregnancyExcluded,
          durationDays: input.durationDays,
          consentTextSha256: rendered.sha256,
        },
      });

      if (request.custodianDecision !== "APPROVED") {
        await tx.recordShareRequest.update({ where: { id: request.id }, data: { status: "PENDING_CUSTODIAN" } });
        return { status: "PENDING_CUSTODIAN" as const, request };
      }
      const created = await this.createGrantInTx(tx, request, consent);
      await tx.recordShareRequest.update({ where: { id: request.id }, data: { status: "APPROVED" } });
      return { status: "APPROVED" as const, request, consent, ...created };
    });

    const auditAction = { DENIED: "SHARE_DENIED", PENDING_CUSTODIAN: "SHARE_PATIENT_APPROVED", APPROVED: "SHARE_APPROVED" }[result.status];
    await this.auditService.log({
      ...(actorUserId ? { actorUserId, actorRole: "PATIENT" } : {}),
      action: auditAction,
      resourceType: "record_share_request",
      resourceId: result.request.id,
      patientId: result.request.patientId,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    if (result.status === "DENIED") {
      // PR-EXP-06/RE5: mismo aviso que "vencida sin respuesta".
      await this.doctorNotifier.notAuthorized(result.request);
    } else if (result.status === "APPROVED") {
      await this.afterGrantCreated(result.grant, result.consent, result.revokeToken);
    }
    return { status: result.status };
  }

  // Crea el acceso a partir de la autorización del paciente. Lo usan las
  // dos vías: aprueba el paciente cuando su médico ya aprobó, o aprueba
  // el médico cuando el paciente ya había aprobado.
  //
  // El vencimiento se cuenta desde que DECIDIÓ el paciente, no desde que
  // se creó el acceso: es la fecha que leyó en el texto ("vigente hasta
  // ..."), aunque su médico apruebe días después.
  async createGrantInTx(
    tx: Prisma.TransactionClient,
    request: RecordShareRequest,
    consent: RecordShareConsent
  ): Promise<{ grant: RecordShareGrant; revokeToken: string }> {
    const excludedCategories = SENSITIVE_CATEGORIES.filter((c) => !consent.includedSensitiveCategories.includes(c));
    const expiresAt = new Date(consent.decidedAt.getTime() + consent.durationDays * ONE_DAY_MS);
    // PR-EXP-06: enlace de revocación — solo el hash vive en la base.
    const revokeToken = randomBytes(32).toString("base64url");
    const grant = await tx.recordShareGrant.create({
      data: {
        consentId: consent.id,
        revokeTokenHash: sha256Hex(revokeToken),
        requesterDoctorId: request.requesterDoctorId,
        custodianDoctorId: request.custodianDoctorId,
        patientId: request.patientId,
        scope: consent.approvedScope,
        excludedCategories,
        pregnancyExcluded: consent.pregnancyExcluded,
        startsAt: new Date(),
        expiresAt,
        status: "ACTIVE",
      },
    });
    return { grant, revokeToken };
  }

  async afterGrantCreated(grant: RecordShareGrant, consent: RecordShareConsent, revokeToken: string): Promise<void> {
    // Por la vía pública, la confirmación con el enlace de revocación
    // llega por el mismo canal que el código. Con cuenta no hay canal
    // externo: el paciente ve y revoca sus accesos dentro de su cuenta.
    if (consent.method === "OTP") {
      const [patient, requester] = await Promise.all([
        this.prisma.patient.findUniqueOrThrow({ where: { id: grant.patientId } }),
        this.prisma.doctor.findUniqueOrThrow({ where: { id: grant.requesterDoctorId } }),
      ]);
      await this.notifications.sendApprovalConfirmation({
        channel: "EMAIL",
        destination: patient.email,
        requesterDisplayName: doctorDisplayName(requester),
        scope: grant.scope,
        expiresAt: grant.expiresAt,
        revocationUrl: `${recordShareWebOrigin()}/expediente-compartido/revocar/${revokeToken}`,
      });
    }
    // PR-EXP-06: al solicitante (aprobada, con vencimiento) y al
    // custodio (aviso, sin el nombre del paciente — RE9).
    await this.doctorNotifier.approved(grant);
    await this.doctorNotifier.custodianNotice(grant);
  }

  // §6: "nunca ampliar" — se revalida en el servidor, no solo en la UI.
  private assertWithinRequest(request: RecordShareRequest, input: Extract<RecordShareDecisionInput, { decision: "APPROVED" }>): void {
    const requestedScope = new Set(request.requestedScope);
    const scopeWithinRequest = input.approvedScope.every((s) => requestedScope.has(s));
    if (!scopeWithinRequest || !input.approvedScope.includes("SUMMARY")) {
      throw new ApiException("RECORD_SHARE_SCOPE_EXCEEDS_REQUEST", "El alcance autorizado no puede ampliar lo solicitado.", HttpStatus.UNPROCESSABLE_ENTITY);
    }
    if (input.durationDays > request.requestedDurationDays) {
      throw new ApiException("RECORD_SHARE_DURATION_EXCEEDS_REQUEST", "La duración autorizada no puede ampliar lo solicitado.", HttpStatus.UNPROCESSABLE_ENTITY);
    }
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
