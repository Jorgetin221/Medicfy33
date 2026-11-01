import { randomInt } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { RecordShareGrant } from "@prisma/client";
import type { RecordShareRevocationInfo } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { AuditService } from "../../identity/services/audit.service";
import type { RequestMeta } from "../../identity/services/auth.service";
import { RECORD_SHARE_NOTIFICATION_PORT, type RecordShareNotificationPort } from "../record-share-notification.port";
import { sha256Hex, timingSafeEqualHex } from "../record-share-crypto.util";
import { doctorDisplayName } from "../record-share-display.util";
import { RecordShareDoctorNotifierService } from "./record-share-doctor-notifier.service";

// Sección B — mismos límites que el OTP de autorización.
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_RESENDS = 3;
const OTP_LOCKOUT_MS = 60 * 60 * 1000;
const OTP_VERIFIED_WINDOW_MS = 30 * 60 * 1000;

// Genérico a propósito: no distingue "no existe" de "ya no hay nada
// que revocar" (mismo criterio que LINK_INVALID_MESSAGE).
const LINK_INVALID_MESSAGE = "Este enlace ya no es válido o ya no hay accesos vigentes que revocar.";

/**
 * PR-EXP-06 — revocación por el paciente (06-notificaciones-revocacion-
 * caducidad.md §2). El enlace llega en la confirmación de aprobación;
 * identifica UN grant, pero desde él el paciente puede revocar
 * cualquier acceso vigente suyo (el token prueba control del mismo
 * correo que autorizó). Exige OTP (propósito REVOKE, separado del de
 * autorización) antes de revocar. El bloqueo es inmediato: el
 * SharedRecordGuard revisa status en CADA request.
 */
@Injectable()
export class RecordShareRevocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(RECORD_SHARE_NOTIFICATION_PORT) private readonly notifications: RecordShareNotificationPort,
    private readonly doctorNotifier: RecordShareDoctorNotifierService
  ) {}

  async getInfo(token: string): Promise<RecordShareRevocationInfo> {
    const linkGrant = await this.resolveLinkGrant(token);
    const grants = await this.prisma.recordShareGrant.findMany({
      where: { patientId: linkGrant.patientId, status: "ACTIVE", expiresAt: { gt: new Date() } },
      include: { requesterDoctor: { include: { primarySpecialty: true } } },
      orderBy: { startsAt: "desc" },
    });
    return {
      activeGrants: grants.map((g) => ({
        grantId: g.id,
        requesterDisplayName: doctorDisplayName(g.requesterDoctor),
        requesterLicense: g.requesterDoctor.professionalLicense,
        requesterSpecialtyName: g.requesterDoctor.primarySpecialty?.nameEs ?? null,
        scope: g.scope,
        expiresAt: g.expiresAt.toISOString(),
        isLinkGrant: g.id === linkGrant.id,
      })),
    };
  }

  async requestOtp(token: string, meta: RequestMeta): Promise<void> {
    const linkGrant = await this.resolveLinkGrant(token);
    const requestId = await this.requestIdOf(linkGrant);
    const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: linkGrant.patientId } });
    const existing = await this.latestChallenge(requestId);

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
        data: { requestId, purpose: "REVOKE", channel: "EMAIL", destinationRef: "PATIENT_EMAIL", codeHash, expiresAt },
      });
    }

    await this.notifications.sendOtpCode({ channel: "EMAIL", destination: patient.email, code });
    await this.audit("SHARE_REVOKE_OTP_SENT", linkGrant, "SUCCESS", meta);
  }

  async verifyOtp(token: string, code: string, meta: RequestMeta): Promise<void> {
    const linkGrant = await this.resolveLinkGrant(token);
    const challenge = await this.latestChallenge(await this.requestIdOf(linkGrant));
    const invalid = () => new ApiException("RECORD_SHARE_OTP_INVALID", "Código inválido o vencido.", HttpStatus.BAD_REQUEST);

    if (!challenge) throw invalid();
    if (challenge.lockedUntil && challenge.lockedUntil > new Date()) {
      throw new ApiException("RECORD_SHARE_OTP_LOCKED", "Demasiados intentos. Espera antes de intentar de nuevo.", HttpStatus.TOO_MANY_REQUESTS);
    }
    if (challenge.consumedAt || challenge.expiresAt < new Date()) throw invalid();

    if (!timingSafeEqualHex(sha256Hex(code), challenge.codeHash)) {
      const attempts = challenge.attempts + 1;
      const locked = attempts >= OTP_MAX_ATTEMPTS;
      await this.prisma.recordShareChallenge.update({
        where: { id: challenge.id },
        data: { attempts, ...(locked ? { lockedUntil: new Date(Date.now() + OTP_LOCKOUT_MS) } : {}) },
      });
      await this.audit(locked ? "SHARE_REVOKE_OTP_LOCKED" : "SHARE_REVOKE_OTP_FAILED", linkGrant, "DENIED", meta);
      throw invalid();
    }
    await this.prisma.recordShareChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
  }

  async revoke(token: string, grantId: string, meta: RequestMeta): Promise<{ revoked: true }> {
    const linkGrant = await this.resolveLinkGrant(token);
    await this.assertOtpRecentlyVerified(await this.requestIdOf(linkGrant));

    // Solo grants del MISMO paciente del enlace y todavía vigentes.
    // Compare-and-set: si otro proceso (barrido, admin) cambió el
    // estado en medio, count=0 y se responde como enlace inválido.
    const { count } = await this.prisma.recordShareGrant.updateMany({
      where: { id: grantId, patientId: linkGrant.patientId, status: "ACTIVE" },
      data: { status: "REVOKED_BY_PATIENT", revokedAt: new Date() },
    });
    if (count === 0) {
      throw new ApiException("RECORD_SHARE_LINK_INVALID", LINK_INVALID_MESSAGE, HttpStatus.NOT_FOUND);
    }

    const grant = await this.prisma.recordShareGrant.findUniqueOrThrow({
      where: { id: grantId },
      include: { requesterDoctor: true, patient: true },
    });
    await this.audit("SHARE_REVOKED", grant, "SUCCESS", meta);
    await this.doctorNotifier.revoked(grant);
    await this.notifications.sendRevocationNotice({
      channel: "EMAIL",
      destination: grant.patient.email,
      requesterDisplayName: doctorDisplayName(grant.requesterDoctor),
    });
    return { revoked: true };
  }

  // El token sigue sirviendo mientras su grant exista — aunque ese
  // grant ya no esté ACTIVE, el paciente puede querer revocar OTROS
  // accesos vigentes desde el mismo correo.
  private async resolveLinkGrant(token: string): Promise<RecordShareGrant> {
    const grant = await this.prisma.recordShareGrant.findUnique({ where: { revokeTokenHash: sha256Hex(token) } });
    if (!grant) {
      throw new ApiException("RECORD_SHARE_LINK_INVALID", LINK_INVALID_MESSAGE, HttpStatus.NOT_FOUND);
    }
    return grant;
  }

  private async requestIdOf(grant: RecordShareGrant): Promise<string> {
    const consent = await this.prisma.recordShareConsent.findUniqueOrThrow({ where: { id: grant.consentId } });
    return consent.requestId;
  }

  private latestChallenge(requestId: string) {
    return this.prisma.recordShareChallenge.findFirst({
      where: { requestId, purpose: "REVOKE" },
      orderBy: { createdAt: "desc" },
    });
  }

  private async assertOtpRecentlyVerified(requestId: string): Promise<void> {
    const verified = await this.prisma.recordShareChallenge.findFirst({
      where: { requestId, purpose: "REVOKE", consumedAt: { gt: new Date(Date.now() - OTP_VERIFIED_WINDOW_MS) } },
    });
    if (!verified) {
      throw new ApiException("RECORD_SHARE_OTP_NOT_VERIFIED", "Verifica el código antes de continuar.", HttpStatus.FORBIDDEN);
    }
  }

  private audit(action: string, grant: RecordShareGrant, result: "SUCCESS" | "DENIED", meta: RequestMeta): Promise<void> {
    return this.auditService.log({
      action,
      resourceType: "record_share_grant",
      resourceId: grant.id,
      patientId: grant.patientId,
      result,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}
