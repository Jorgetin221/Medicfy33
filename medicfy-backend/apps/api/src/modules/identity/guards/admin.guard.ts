import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthenticatedRequest } from "./jwt-auth.guard";

// Minimal role check — built for the M2 admin verification endpoints
// (ahead of M13's full admin panel), same pattern as
// DoctorVerifiedGuard ahead of M9. Broader RBAC (spec §5.2) arrives
// when more than this one concern needs it.
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user.primaryRole !== "ADMIN" && request.user.primaryRole !== "SUPERADMIN") {
      throw new ForbiddenException("Requiere rol de administrador.");
    }
    return true;
  }
}
