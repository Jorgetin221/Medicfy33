import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { TotpService } from "./totp.service";
import { CryptoService } from "./crypto.service";

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly totpService: TotpService,
    private readonly cryptoService: CryptoService
  ) {}

  // Flow step 3: mandatory TOTP enrollment with downloadable backup
  // codes. mfaEnabled stays false until the code is confirmed.
  async startEnrollment(userId: string): Promise<{ otpauthUri: string; backupCodes: string[] }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const enrollment = this.totpService.enroll(user.email);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaSecretEncrypted: this.cryptoService.encrypt(enrollment.secretBase32),
        mfaBackupCodesHashed: enrollment.backupCodesHashed,
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
    if (!this.totpService.verify(secret, code)) {
      throw new ApiException("MFA_CODE_INVALID", "Código inválido.", HttpStatus.BAD_REQUEST);
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true, loginsWithoutMfa: 0 },
    });
  }

  async disable(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecretEncrypted: null, mfaBackupCodesHashed: [] },
    });
  }
}
