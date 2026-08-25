import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { AuthService } from "../services/auth.service";
import type { AuthenticatedRequest } from "./jwt-auth.guard";

// M1-RN-002 / M1-CA-003: a doctor whose verification_status isn't
// VERIFIED cannot perform a clinical action. Applied on the routes
// that actually emit a legal/clinical document — prescriptions.create
// and .createExternalPhysical (M9), encounters.sign (M8), lab
// orders.create (M10) — not on drafting/reading/cancelling routes,
// which the spec's own wording ("no puede emitir... hasta estar
// verified") doesn't restrict.
@Injectable()
export class DoctorVerifiedGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    await this.authService.assertDoctorVerified(request.user.sub);
    return true;
  }
}
