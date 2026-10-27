import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { TotpService } from "./totp.service";
import { CryptoService } from "./crypto.service";
import { PasswordService } from "./password.service";
import { AuditService } from "./audit.service";
import type { RequestMeta } from "./auth.service";

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly totpService: TotpService,
    private readonly cryptoService: CryptoService,
    private readonly passwordService: PasswordService,
    private readonly auditService: AuditService
  ) {}

  // Flow step 3: mandatory TOTP enrollment with downloadable backup
  // codes. mfaEnabled stays false until the code is confirmed.
  async startEnrollment(userId: string): Promise<{ otpauthUri: string; backupCodes: string[] }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    // C-01: con MFA ya activo, reenrolar sobrescribiría el secreto del
    // titular. Para cambiar de dispositivo primero se desactiva, y eso
    // exige contraseña + código vigente.
    if (user.mfaEnabled) {
      throw new ApiException(
        "MFA_ALREADY_ENABLED",
        "La verificación en dos pasos ya está activa. Desactívala primero para registrar otro dispositivo.",
        HttpStatus.CONFLICT
      );
    }
    const enrollment = this.totpService.enroll(user.email);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaSecretEncrypted: this.cryptoService.encrypt(enrollment.secretBase32),
        mfaBackupCodesHashed: await this.totpService.hashBackupCodes(enrollment.backupCodesPlain),
      },
    });

    return { otpauthUri: enrollment.otpauthUri, backupCodes: enrollment.backupCodesPlain };
  }

  async confirmEnrollment(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaSecretEncrypted) {
      throw new ApiException(
        "MFA_ENROLLMENT_NOT_STARTED",
        "Primero debes iniciar el registro de verificación en dos pasos.",
        HttpStatus.BAD_REQUEST
      );
    }
    const secret = this.cryptoService.decrypt(user.mfaSecretEncrypted);
    const step = this.totpService.verifyStep(secret, code);
    if (step === null) {
      throw new ApiException("MFA_CODE_INVALID", "Código inválido.", HttpStatus.BAD_REQUEST);
    }
    await this.prisma.user.update({
      where: { id: userId },
      // M-01: el código con que se confirmó ya no sirve para entrar.
      data: { mfaEnabled: true, loginsWithoutMfa: 0, mfaLastTotpStep: step },
    });
  }

  // A-27: desactivar exige reautenticación completa (contraseña + TOTP
  // o código de respaldo) y queda en bitácora, con éxito o rechazo.
  async disable(userId: string, password: string, code: string, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const passwordOk = await this.passwordService.verify(user.passwordHash, password);
    const codeOk = passwordOk && user.mfaEnabled && user.mfaSecretEncrypted !== null && (await this.isCurrentSecondFactor(user, code));

    await this.auditService.log({
      actorUserId: userId,
      actorRole: user.primaryRole,
      action: "auth.mfa.disable",
      resourceType: "user",
      resourceId: userId,
      result: codeOk ? "SUCCESS" : "DENIED",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    if (!codeOk) {
      throw new ApiException("MFA_CODE_INVALID", "Contraseña o código incorrectos.", HttpStatus.UNAUTHORIZED);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecretEncrypted: null, mfaBackupCodesHashed: [], mfaLastTotpStep: null },
    });
  }

  // TOTP vigente y no repetido (M-01), o un código de respaldo válido.
  private async isCurrentSecondFactor(
    user: { mfaSecretEncrypted: string | null; mfaBackupCodesHashed: string[]; mfaLastTotpStep: number | null },
    code: string
  ): Promise<boolean> {
    if (user.mfaSecretEncrypted) {
      const step = this.totpService.verifyStep(this.cryptoService.decrypt(user.mfaSecretEncrypted), code);
      if (step !== null) return user.mfaLastTotpStep === null || step > user.mfaLastTotpStep;
    }
    return (await this.totpService.matchBackupCode(user.mfaBackupCodesHashed, code)) !== null;
  }
}
