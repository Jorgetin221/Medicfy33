import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { AuthService } from "../services/auth.service";
import type { AuthenticatedRequest } from "./jwt-auth.guard";

// M1-RN-002 / M1-CA-003: a doctor whose verification_status isn't
// VERIFIED cannot perform a clinical action. Meant to be applied
// alongside JwtAuthGuard on M9 (prescriptions) and M10 (lab orders)
// controllers once they exist; exercised directly by an M1 test today
// since neither module exists yet.
@Injectable()
export class DoctorVerifiedGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    await this.authService.assertDoctorVerified(request.user.sub);
    return true;
  }
}
