import { Inject, Injectable } from "@nestjs/common";
import { HttpStatus } from "@nestjs/common";
import { randomBytes, createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import type { RegisterDoctorInput, RegisterPatientInput } from "@medicfy/contracts";
import { IDENTITY_ERROR_CODES } from "@medicfy/contracts";
import type { RoleName } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { PasswordService } from "./password.service";
import { TotpService } from "./totp.service";
import { TokenService } from "./token.service";
import { ConsentService } from "./consent.service";
import { AuditService } from "./audit.service";
import { VerificationCodeService } from "./verification-code.service";
import { CryptoService } from "./crypto.service";
import { NOTIFICATION_PORT, type NotificationPort } from "./notification.port";
import { CURRENT_PRIVACY_NOTICE_VERSION } from "../legal-document-versions";

// M1-RN-005: PATIENT is the only role that never requires MFA.
const MFA_REQUIRED_ROLES: readonly RoleName[] = ["DOCTOR", "ASSISTANT", "LAB", "SUPPORT", "ADMIN", "SUPERADMIN"];
const MAX_LOGINS_WITHOUT_MFA = 3;
const MAX_FAILED_ATTEMPTS = 5;
const BASE_LOCKOUT_MS = 15 * 60 * 1000;
const MFA_SESSION_TOKEN_TTL_SECONDS = 5 * 60;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export interface RequestMeta {
  ip: string;
  userAgent: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly totpService: TotpService,
    private readonly tokenService: TokenService,
    private readonly consentService: ConsentService,
    private readonly auditService: AuditService,
    private readonly verificationCodeService: VerificationCodeService,
    private readonly cryptoService: CryptoService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort
  ) {}

  // M1-RN-001: one email, one account, multiple roles possible.
  private async assertEmailAvailable(email: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ApiException(
        "EMAIL_ALREADY_REGISTERED",
        "Este correo ya está registrado. Si ya tienes cuenta, inicia sesión; si quieres añadir un rol, contacta a soporte.",
        HttpStatus.CONFLICT
      );
    }
  }

  async registerPatient(input: RegisterPatientInput, meta: RequestMeta): Promise<{ userId: string }> {
    await this.assertEmailAvailable(input.email);
    const passwordHash = await this.passwordService.hash(input.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email,
          phoneE164: input.phone,
          passwordHash,
          primaryRole: "PATIENT",
        },
      });
      await tx.userRole.create({ data: { userId: created.id, role: "PATIENT" } });
      return created;
    });

    // M1-RN-003: three separate, unchecked-by-default consent decisions.
    await this.consentService.record({
      userId: user.id,
      consentType: "PRIVACY_NOTICE",
      documentVersion: CURRENT_PRIVACY_NOTICE_VERSION,
      granted: input.consents.privacyNotice,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    await this.consentService.record({
      userId: user.id,
      consentType: "SENSITIVE_DATA",
      documentVersion: CURRENT_PRIVACY_NOTICE_VERSION,
      granted: input.consents.sensitiveData,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    await this.consentService.record({
      userId: user.id,
      consentType: "DIGITAL_PRESCRIPTION_CHANNEL",
      documentVersion: CURRENT_PRIVACY_NOTICE_VERSION,
      granted: input.consents.digitalPrescriptionChannel,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    const code = await this.verificationCodeService.issue(user.id, "EMAIL");
    await this.notifications.sendEmailVerificationCode(user.email, code);

    return { userId: user.id };
  }

  // Flow step 1 per spec §7 M1: "email, contraseña, nombre legal,
  // cédula profesional, especialidad, teléfono". Consent capture is not
  // part of the doctor flow text (M1-RN-003 only names patient
  // registration) — not added here to avoid inventing a rule.
  async registerDoctor(input: RegisterDoctorInput, meta: RequestMeta): Promise<{ userId: string }> {
    await this.assertEmailAvailable(input.email);

    const duplicateLicense = await this.prisma.doctor.findUnique({
      where: { professionalLicense: input.professionalLicense },
    });
    if (duplicateLicense) {
      // Casos límite: "Cédula duplicada... rechazo duro y alerta a
      // admin: indica suplantación."
      await this.auditService.log({
        action: "doctor.registration.duplicate_license",
        resourceType: "doctor",
        result: "DENIED",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: { professionalLicense: input.professionalLicense },
      });
      throw new ApiException(
        "CEDULA_ALREADY_REGISTERED",
        "Esta cédula profesional ya está registrada en otra cuenta.",
        HttpStatus.CONFLICT
      );
    }

    const specialty = await this.prisma.specialty.findUnique({
      where: { code: input.primarySpecialtyCode },
    });
    if (!specialty || !specialty.isActive) {
      throw new ApiException(
        "SPECIALTY_NOT_FOUND",
        "Especialidad no encontrada en el catálogo.",
        HttpStatus.BAD_REQUEST
      );
    }

    const passwordHash = await this.passwordService.hash(input.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email,
          phoneE164: input.phone,
          passwordHash,
          primaryRole: "DOCTOR",
        },
      });
      await tx.userRole.create({ data: { userId: created.id, role: "DOCTOR" } });
      await tx.doctor.create({
        data: {
          userId: created.id,
          legalFirstName: input.legalFirstName,
          legalLastName: input.legalLastName,
          professionalLicense: input.professionalLicense,
          primarySpecialtyId: specialty.id,
          verificationStatus: "SUBMITTED",
        },
      });
      return created;
    });

    const code = await this.verificationCodeService.issue(user.id, "EMAIL");
    await this.notifications.sendEmailVerificationCode(user.email, code);

    return { userId: user.id };
  }

  async verifyEmail(userId: string, code: string): Promise<void> {
    const ok = await this.verificationCodeService.verify(userId, "EMAIL", code);
    if (!ok) {
      throw new ApiException("VERIFICATION_CODE_INVALID", "Código inválido o expirado.", HttpStatus.BAD_REQUEST);
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date(), status: "ACTIVE" },
    });
  }

  async verifyPhone(userId: string, code: string): Promise<void> {
    const ok = await this.verificationCodeService.verify(userId, "PHONE", code);
    if (!ok) {
      throw new ApiException("VERIFICATION_CODE_INVALID", "Código inválido o expirado.", HttpStatus.BAD_REQUEST);
    }
    await this.prisma.user.update({ where: { id: userId }, data: { phoneVerifiedAt: new Date() } });
  }

  // M1-RN-006 (lockout) → M1-RN-004 (consent reacceptance) →
  // M1-RN-005 (MFA gate) → issue tokens. Order chosen deliberately:
  // an account that's locked or whose credentials are wrong should
  // never leak whether consent or MFA state is stale.
  async login(
    email: string,
    password: string,
    meta: RequestMeta
  ): Promise<IssuedTokens | { mfaRequired: true; mfaSessionToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      await this.auditService.log({
        action: "auth.login",
        resourceType: "user",
        result: "DENIED",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: { reason: "no_such_user" },
      });
      throw new ApiException(
        "AUTH_INVALID_CREDENTIALS",
        "Correo o contraseña incorrectos.",
        IDENTITY_ERROR_CODES.AUTH_INVALID_CREDENTIALS
      );
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ApiException(
        "AUTH_ACCOUNT_LOCKED",
        "Cuenta bloqueada temporalmente por múltiples intentos fallidos.",
        IDENTITY_ERROR_CODES.AUTH_ACCOUNT_LOCKED,
        { retry_after: user.lockedUntil.toISOString() }
      );
    }

    const passwordOk = await this.passwordService.verify(user.passwordHash, password);
    if (!passwordOk) {
      const lockedUntil = await this.handleFailedLogin(user.id, meta);
      if (lockedUntil) {
        throw new ApiException(
          "AUTH_ACCOUNT_LOCKED",
          "Cuenta bloqueada temporalmente por múltiples intentos fallidos.",
          IDENTITY_ERROR_CODES.AUTH_ACCOUNT_LOCKED,
          { retry_after: lockedUntil.toISOString() }
        );
      }
      throw new ApiException(
        "AUTH_INVALID_CREDENTIALS",
        "Correo o contraseña incorrectos.",
        IDENTITY_ERROR_CODES.AUTH_INVALID_CREDENTIALS
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockoutCount: 0 },
    });

    if (!user.emailVerifiedAt) {
      throw new ApiException(
        "AUTH_EMAIL_NOT_VERIFIED",
        "Verifica tu correo electrónico antes de iniciar sesión.",
        IDENTITY_ERROR_CODES.AUTH_EMAIL_NOT_VERIFIED
      );
    }

    // M1-RN-004: reject on a stale privacy-notice acceptance. Scoped to
    // PATIENT because M1-RN-003's consent-capture flow is explicitly
    // patient-only in the spec text — doctor consent/contract
    // acceptance (spec §15.2 "Contrato con el médico") is a distinct,
    // not-yet-specified concern, not assumed to work the same way.
    if (user.primaryRole === "PATIENT") {
      const privacyConsent = await this.consentService.currentStatus(user.id, "PRIVACY_NOTICE");
      if (
        !privacyConsent ||
        !privacyConsent.granted ||
        privacyConsent.documentVersion !== CURRENT_PRIVACY_NOTICE_VERSION
      ) {
        throw new ApiException(
          "AUTH_CONSENT_REQUIRED",
          "Debes aceptar la versión vigente del aviso de privacidad para continuar.",
          IDENTITY_ERROR_CODES.AUTH_CONSENT_REQUIRED
        );
      }
    }

    if (MFA_REQUIRED_ROLES.includes(user.primaryRole)) {
      if (user.mfaEnabled) {
        const mfaSessionToken = jwt.sign(
          { sub: user.id, purpose: "mfa_pending" },
          mustGetJwtSecret(),
          { expiresIn: MFA_SESSION_TOKEN_TTL_SECONDS }
        );
        return { mfaRequired: true, mfaSessionToken };
      }

      // M1-RN-005: not enrolled — allowed for the first 3 logins, then
      // hard-blocked until enrollment (M1-CA-005).
      if (user.loginsWithoutMfa >= MAX_LOGINS_WITHOUT_MFA) {
        throw new ApiException(
          "AUTH_MFA_REQUIRED",
          "Debes activar la verificación en dos pasos para continuar.",
          IDENTITY_ERROR_CODES.AUTH_MFA_REQUIRED,
          { enrollment_required: true }
        );
      }
      await this.prisma.user.update({
        where: { id: user.id },
        data: { loginsWithoutMfa: { increment: 1 } },
      });
    }

    return this.completeLogin(user.id, user.primaryRole, meta);
  }

  async completeMfaLogin(mfaSessionToken: string, code: string, meta: RequestMeta): Promise<IssuedTokens> {
    const payload = this.verifyMfaSessionToken(mfaSessionToken);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });

    const validTotp = user.mfaSecretEncrypted
      ? this.totpService.verify(this.cryptoService.decrypt(user.mfaSecretEncrypted), code)
      : false;
    const validBackup = validTotp ? false : this.totpService.verifyBackupCode(user.mfaBackupCodesHashed, code);

    if (!validTotp && !validBackup) {
      await this.handleFailedLogin(user.id, meta);
      throw new ApiException(
        "AUTH_INVALID_CREDENTIALS",
        "Código de verificación inválido.",
        IDENTITY_ERROR_CODES.AUTH_INVALID_CREDENTIALS
      );
    }

    if (validBackup) {
      // Casos límite: "recuperación solo con código de respaldo...
      // Registrado en auditoría." Consume the used backup code.
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          mfaBackupCodesHashed: user.mfaBackupCodesHashed.filter(
            (hashed) => hashed !== hashBackupCodeForComparison(code)
          ),
        },
      });
      await this.auditService.log({
        actorUserId: user.id,
        actorRole: user.primaryRole,
        action: "auth.mfa.backup_code_used",
        resourceType: "user",
        resourceId: user.id,
        result: "SUCCESS",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
    }

    return this.completeLogin(user.id, user.primaryRole, meta);
  }

  private async completeLogin(userId: string, primaryRole: RoleName, meta: RequestMeta): Promise<IssuedTokens> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date(), lastLoginIp: meta.ip },
    });
    const accessToken = this.tokenService.signAccessToken({ sub: userId, primaryRole });
    const { plainToken: refreshToken } = await this.tokenService.createSession({
      userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    await this.auditService.log({
      actorUserId: userId,
      actorRole: primaryRole,
      action: "auth.login",
      resourceType: "user",
      resourceId: userId,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    return { accessToken, refreshToken };
  }

  // M1-RN-006: 5 failures → 15 min lockout, exponential on repeat
  // offenses, logged to audit_log without exception (M1-CA-004).
  // Returns the lockedUntil timestamp when this attempt is the one that
  // triggered the lockout, so the caller can respond with
  // AUTH_ACCOUNT_LOCKED (423) instead of the generic 401 — a real bug
  // caught by the M1-CA-004 test: the caller used to always throw 401.
  private async handleFailedLogin(userId: string, meta: RequestMeta): Promise<Date | null> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: { increment: 1 } },
    });

    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      const lockoutMs = BASE_LOCKOUT_MS * 2 ** user.lockoutCount;
      const lockedUntil = new Date(Date.now() + lockoutMs);
      await this.prisma.user.update({
        where: { id: userId },
        data: { lockedUntil, failedLoginAttempts: 0, lockoutCount: { increment: 1 } },
      });
      await this.auditService.log({
        actorUserId: userId,
        action: "auth.account_locked",
        resourceType: "user",
        resourceId: userId,
        result: "DENIED",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: { lockedUntil: lockedUntil.toISOString(), lockoutCount: user.lockoutCount + 1 },
      });
      return lockedUntil;
    }

    await this.auditService.log({
      actorUserId: userId,
      action: "auth.login",
      resourceType: "user",
      resourceId: userId,
      result: "DENIED",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { reason: "bad_password", failedLoginAttempts: user.failedLoginAttempts },
    });
    return null;
  }

  async refresh(plainRefreshToken: string): Promise<IssuedTokens> {
    // The session's own user determines the idle-timeout policy, so we
    // must look the user up before calling rotate. This is a read of
    // the hashed token, not the plaintext, so it's safe pre-rotation.
    const existing = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hashRefreshTokenForLookup(plainRefreshToken) },
      include: { user: true },
    });
    if (!existing) {
      throw new ApiException(
        "AUTH_INVALID_CREDENTIALS",
        "Sesión inválida o expirada.",
        IDENTITY_ERROR_CODES.AUTH_INVALID_CREDENTIALS
      );
    }

    const outcome = await this.tokenService.rotate(plainRefreshToken, existing.user.primaryRole);
    if (!outcome.ok) {
      throw new ApiException(
        "AUTH_INVALID_CREDENTIALS",
        "Sesión inválida o expirada.",
        IDENTITY_ERROR_CODES.AUTH_INVALID_CREDENTIALS,
        { reason: outcome.reason }
      );
    }

    const accessToken = this.tokenService.signAccessToken({
      sub: existing.user.id,
      primaryRole: existing.user.primaryRole,
    });
    return { accessToken, refreshToken: outcome.plainToken };
  }

  async logout(plainRefreshToken: string): Promise<void> {
    await this.tokenService.revoke(plainRefreshToken);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Always behave the same regardless of whether the account exists.
    if (!user) {
      return;
    }
    const plainToken = randomBytes(32).toString("base64url");
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash("sha256").update(plainToken).digest("hex"),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });
    const resetUrl = `${mustGetAppBaseUrl()}/reset-password?token=${plainToken}`;
    await this.notifications.sendPasswordResetLink(user.email, resetUrl);
  }

  async resetPassword(plainToken: string, newPassword: string): Promise<void> {
    const tokenHash = createHash("sha256").update(plainToken).digest("hex");
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new ApiException("PASSWORD_RESET_TOKEN_INVALID", "Enlace inválido o expirado.", HttpStatus.BAD_REQUEST);
    }

    const passwordHash = await this.passwordService.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // Resetting the password revokes every existing session.
      this.prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  // M1-CA-003 / DOCTOR_NOT_VERIFIED — reused by later modules (M9, M10)
  // once they exist; exercised directly by an M1 test for now since no
  // prescription endpoint exists yet.
  async assertDoctorVerified(userId: string): Promise<void> {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
    if (!doctor || doctor.verificationStatus !== "VERIFIED") {
      throw new ApiException(
        "DOCTOR_NOT_VERIFIED",
        "Tu cuenta de médico aún no está verificada.",
        IDENTITY_ERROR_CODES.DOCTOR_NOT_VERIFIED
      );
    }
  }

  private verifyMfaSessionToken(token: string): { sub: string } {
    try {
      const payload = jwt.verify(token, mustGetJwtSecret()) as { sub: string; purpose: string };
      if (payload.purpose !== "mfa_pending") {
        throw new Error("wrong token purpose");
      }
      return payload;
    } catch {
      throw new ApiException(
        "AUTH_INVALID_CREDENTIALS",
        "Sesión de verificación inválida o expirada.",
        IDENTITY_ERROR_CODES.AUTH_INVALID_CREDENTIALS
      );
    }
  }
}

function mustGetJwtSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET is not set");
  }
  return secret;
}

function mustGetAppBaseUrl(): string {
  const url = process.env.APP_BASE_URL;
  if (!url) {
    throw new Error("APP_BASE_URL is not set");
  }
  return url;
}

function hashRefreshTokenForLookup(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function hashBackupCodeForComparison(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
