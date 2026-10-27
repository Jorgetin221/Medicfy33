import { Inject, Injectable } from "@nestjs/common";
import { HttpStatus } from "@nestjs/common";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { hash as argon2Hash } from "argon2";
import type { RegisterDoctorInput, RegisterPatientInput } from "@medicfy/contracts";
import { IDENTITY_ERROR_CODES } from "@medicfy/contracts";
import type { RoleName, UserStatus } from "@prisma/client";
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
import { generateDoctorSlug } from "../../../common/slug.util";
import { nextMedicfyId } from "../../../common/medicfy-id.util";
import { signPurposeToken, verifyPurposeToken } from "../../../common/purpose-token.util";

// M1-RN-005: PATIENT is the only role that never requires MFA.
const MFA_REQUIRED_ROLES: readonly RoleName[] = ["DOCTOR", "ASSISTANT", "LAB", "SUPPORT", "ADMIN", "SUPERADMIN"];
const MAX_LOGINS_WITHOUT_MFA = 3;
const MAX_FAILED_ATTEMPTS = 5;
const BASE_LOCKOUT_MS = 15 * 60 * 1000;
// M-03: el bloqueo exponencial no tenía tope — un atacante que conoce
// el correo de un médico podía dejarlo fuera días enteros.
const MAX_LOCKOUT_MS = 24 * 60 * 60 * 1000;
const MFA_SESSION_TOKEN_TTL_SECONDS = 5 * 60;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const mfaSessionTokenSchema = z.object({ sub: z.string().uuid() });

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
    // Secuencia de Postgres, no transaccional por diseño (ver
    // medicfy-id.util.ts) — se pide antes de abrir la transacción,
    // igual que PatientService.createByDoctor.
    const medicfyId = await nextMedicfyId(this.prisma);

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
      // M5-RN-009: antes de v2.3 esta operación solo creaba el `user`
      // — la fila `patients` quedaba pendiente para siempre, así que
      // "For My Patients" y el agendamiento público no tenían dueño
      // real. Misma forma que PatientService.createByDoctor, pero
      // source=SELF_SIGNUP y sin tutor (registerPatientSchema exige
      // mayoría de edad).
      await tx.patient.create({
        data: {
          userId: created.id,
          medicfyId,
          firstName: input.firstName,
          lastNamePaternal: input.lastNamePaternal,
          lastNameMaternal: input.lastNameMaternal ?? null,
          birthDate: new Date(`${input.birthDate}T00:00:00Z`),
          sexAtBirth: input.sexAtBirth,
          phoneE164: input.phone,
          email: input.email,
          source: "SELF_SIGNUP",
        },
      });
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
          // M5-RN-007: el slug del enlace público se fija una sola vez
          // aquí, a partir del nombre legal — nunca editable después.
          slug: generateDoctorSlug(input.legalFirstName, input.legalLastName),
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
      // M-03: mismo costo de argon2 que con un usuario real, para que el
      // tiempo de respuesta no revele si el correo existe.
      await this.passwordService.verify(await decoyPasswordHash(), password).catch(() => false);
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

    // A-05: una cuenta suspendida o dada de baja no inicia sesión. Va
    // después de verificar la contraseña para no revelar el estado de
    // la cuenta a quien no la conoce.
    if (isBlockedUserStatus(user.status)) {
      await this.auditService.log({
        actorUserId: user.id,
        action: "auth.login",
        resourceType: "user",
        resourceId: user.id,
        result: "DENIED",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: { reason: "account_blocked", status: user.status },
      });
      throw new ApiException("AUTH_ACCOUNT_SUSPENDED", "Esta cuenta está suspendida. Contacta a soporte.", HttpStatus.FORBIDDEN);
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
        const mfaSessionToken = signPurposeToken("mfa_pending", { sub: user.id }, MFA_SESSION_TOKEN_TTL_SECONDS);
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

    // M-01: el bloqueo por intentos fallidos aplica también al segundo
    // factor — antes el paso TOTP lo ignoraba y permitía seguir
    // probando códigos durante el bloqueo.
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ApiException(
        "AUTH_ACCOUNT_LOCKED",
        "Cuenta bloqueada temporalmente por múltiples intentos fallidos.",
        IDENTITY_ERROR_CODES.AUTH_ACCOUNT_LOCKED,
        { retry_after: user.lockedUntil.toISOString() }
      );
    }

    const totpStep = user.mfaSecretEncrypted ? this.totpService.verifyStep(this.cryptoService.decrypt(user.mfaSecretEncrypted), code) : null;
    // M-01: anti-repetición — el mismo código (mismo paso de 30 s) solo
    // entra una vez. El compare-and-set evita que dos peticiones
    // simultáneas con el mismo código pasen las dos.
    const validTotp =
      totpStep !== null &&
      (
        await this.prisma.user.updateMany({
          where: { id: user.id, OR: [{ mfaLastTotpStep: null }, { mfaLastTotpStep: { lt: totpStep } }] },
          data: { mfaLastTotpStep: totpStep },
        })
      ).count === 1;
    const matchedBackupHash = validTotp ? null : await this.totpService.matchBackupCode(user.mfaBackupCodesHashed, code);

    if (!validTotp && !matchedBackupHash) {
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
        "Código de verificación inválido.",
        IDENTITY_ERROR_CODES.AUTH_INVALID_CREDENTIALS
      );
    }

    if (matchedBackupHash) {
      // Casos límite: "recuperación solo con código de respaldo...
      // Registrado en auditoría." Consume the used backup code.
      await this.prisma.user.update({
        where: { id: user.id },
        data: { mfaBackupCodesHashed: user.mfaBackupCodesHashed.filter((hashed) => hashed !== matchedBackupHash) },
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

    await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0 } });
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
  // M-05: público para que la reautenticación al firmar recetas/órdenes
  // (SignatureVerificationService) cuente contra el mismo bloqueo.
  async handleFailedLogin(userId: string, meta: RequestMeta): Promise<Date | null> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: { increment: 1 } },
    });

    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      const lockoutMs = Math.min(BASE_LOCKOUT_MS * 2 ** user.lockoutCount, MAX_LOCKOUT_MS);
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
      const reusedByUserId = await this.tokenService.revokeIfReused(plainRefreshToken);
      if (reusedByUserId) {
        await this.auditService.log({
          actorUserId: reusedByUserId,
          action: "auth.refresh_token_reused",
          resourceType: "session",
          result: "DENIED",
          metadata: { reason: "rotated_refresh_token_presented_again" },
        });
      }
      throw new ApiException(
        "AUTH_INVALID_CREDENTIALS",
        "Sesión inválida o expirada.",
        IDENTITY_ERROR_CODES.AUTH_INVALID_CREDENTIALS
      );
    }

    // A-05: suspender una cuenta corta también las sesiones abiertas.
    if (isBlockedUserStatus(existing.user.status)) {
      await this.tokenService.revoke(plainRefreshToken);
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
    // M-33: el enlace lleva a la pantalla de la aplicación web (antes
    // apuntaba al dominio del API, donde esa ruta no existe).
    const resetUrl = `${process.env.WEB_ORIGIN ?? "http://localhost:3000"}/restablecer-contrasena?token=${plainToken}`;
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
      return verifyPurposeToken("mfa_pending", token, mfaSessionTokenSchema);
    } catch {
      throw new ApiException(
        "AUTH_INVALID_CREDENTIALS",
        "Sesión de verificación inválida o expirada.",
        IDENTITY_ERROR_CODES.AUTH_INVALID_CREDENTIALS
      );
    }
  }
}

let decoyHashPromise: Promise<string> | null = null;
function decoyPasswordHash(): Promise<string> {
  decoyHashPromise ??= argon2Hash(randomBytes(32).toString("hex"));
  return decoyHashPromise;
}

export function isBlockedUserStatus(status: UserStatus): boolean {
  return status === "SUSPENDED" || status === "DEACTIVATED";
}

function hashRefreshTokenForLookup(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

