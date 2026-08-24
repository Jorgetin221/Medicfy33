import { HttpStatus, Injectable } from "@nestjs/common";
import { ApiException } from "../../../common/api-exception";
import { PrismaService } from "../../../prisma/prisma.service";
import { PasswordService } from "./password.service";
import { TotpService } from "./totp.service";
import { CryptoService } from "./crypto.service";

// M9-RN-009/M9-CA-007: "firmar exige segundo factor aunque la sesión
// esté abierta" — contraseña + TOTP re-ingresados en el momento
// mismo de firmar, no basta con el JWT de la sesión activa.
// Compartido entre prescriptions y labs (y, cuando exista, la firma
// de clinical_notes) — mismo patrón que AuditService: vive en
// identity porque depende de sus servicios internos, se importa
// entre módulos como ya hace AuditService.
@Injectable()
export class SignatureVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly totpService: TotpService,
    private readonly cryptoService: CryptoService
  ) {}

  async verify(userId: string, password: string, totpCode: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiException("SIGNATURE_MFA_REQUIRED", "No se pudo verificar tu identidad para firmar.", HttpStatus.PRECONDITION_REQUIRED);
    }

    const passwordOk = await this.passwordService.verify(user.passwordHash, password);
    if (!passwordOk) {
      throw new ApiException("SIGNATURE_MFA_REQUIRED", "Contraseña incorrecta.", HttpStatus.PRECONDITION_REQUIRED);
    }

    if (!user.mfaEnabled || !user.mfaSecretEncrypted) {
      throw new ApiException(
        "SIGNATURE_MFA_REQUIRED",
        "Debes tener la verificación en dos pasos activada para firmar documentos clínicos.",
        HttpStatus.PRECONDITION_REQUIRED
      );
    }

    const totpOk = this.totpService.verify(this.cryptoService.decrypt(user.mfaSecretEncrypted), totpCode);
    if (!totpOk) {
      throw new ApiException("SIGNATURE_MFA_REQUIRED", "Código de verificación inválido.", HttpStatus.PRECONDITION_REQUIRED);
    }
  }
}
