import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthenticatedRequest } from "../../identity/guards/jwt-auth.guard";

// Prompt 10 / P4 §6.5: "el alta de términos es un flujo aparte con rol
// curador". Mismo patrón mínimo que AdminGuard. SUPERADMIN se acepta
// para el arranque (todavía no existe un flujo de alta de curadores);
// ADMIN a propósito NO: administrar la plataforma y curar vocabulario
// clínico son responsabilidades distintas.
@Injectable()
export class CuratorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user.primaryRole !== "CURATOR" && request.user.primaryRole !== "SUPERADMIN") {
      throw new ForbiddenException("Requiere rol de curador de catálogos.");
    }
    return true;
  }
}
