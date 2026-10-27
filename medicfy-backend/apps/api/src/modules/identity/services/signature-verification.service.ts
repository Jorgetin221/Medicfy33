import { HttpStatus, Injectable } from "@nestjs/common";
import { IDENTITY_ERROR_CODES } from "@medicfy/contracts";
import { ApiException } from "../../../common/api-exception";
import { PrismaService } from "../../../prisma/prisma.service";
import { PasswordService } from "./password.service";
import { AuthService } from "./auth.service";
import { currentRequestContext } from "../../../common/request-context";

// M9-RN-009/M9-CA-007: firmar exige re-ingresar la contraseña en el
// momento mismo de firmar — no basta con el JWT de la sesión activa.
//
// DESVIACIÓN EXPLÍCITA de la especificación, autorizada por el
// usuario (2026-10-16): la especificación pedía además un código
// TOTP. Con TOTP obligatorio, un médico sin verificación en dos pasos
// activada no podía cerrar la consulta ni emitir receta/orden
// electrónica. La firma sigue quedando sellada (hash, snapshot legal,
// bitácora); lo que cambia es el factor de reautenticación. La
// verificación en dos pasos sigue disponible para el inicio de sesión.
//
// Compartido entre la nota clínica, su cancelación, recetas y
// órdenes — mismo patrón que AuditService: vive en identity porque
// depende de sus servicios internos.
@Injectable()
export class SignatureVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly authService: AuthService
  ) {}

  async verify(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiException("SIGNATURE_MFA_REQUIRED", "No se pudo verificar tu identidad para firmar.", HttpStatus.PRECONDITION_REQUIRED);
    }

    // M-05: la contraseña de firma es la de la cuenta — probarla aquí
    // cuenta contra el mismo bloqueo que el inicio de sesión. Antes este
    // verificador no contaba fallos y servía para adivinarla sin límite.
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
      const context = currentRequestContext();
      await this.authService.handleFailedLogin(user.id, { ip: context?.ip ?? "unknown", userAgent: context?.userAgent ?? "unknown" });
      throw new ApiException("SIGNATURE_MFA_REQUIRED", "Contraseña incorrecta.", HttpStatus.PRECONDITION_REQUIRED);
    }
    if (user.failedLoginAttempts > 0) {
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0 } });
    }
  }
}
