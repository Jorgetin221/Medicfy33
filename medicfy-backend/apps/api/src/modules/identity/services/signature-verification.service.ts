import { HttpStatus, Injectable } from "@nestjs/common";
import { ApiException } from "../../../common/api-exception";
import { PrismaService } from "../../../prisma/prisma.service";
import { PasswordService } from "./password.service";

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
    private readonly passwordService: PasswordService
  ) {}

  async verify(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiException("SIGNATURE_MFA_REQUIRED", "No se pudo verificar tu identidad para firmar.", HttpStatus.PRECONDITION_REQUIRED);
    }

    const passwordOk = await this.passwordService.verify(user.passwordHash, password);
    if (!passwordOk) {
      throw new ApiException("SIGNATURE_MFA_REQUIRED", "Contraseña incorrecta.", HttpStatus.PRECONDITION_REQUIRED);
    }
  }
}
