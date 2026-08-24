import { HttpStatus, Injectable } from "@nestjs/common";
import type { Doctor } from "@prisma/client";
import { ApiException } from "../../../common/api-exception";
import { DoctorProfileService } from "../../doctors/services/doctor-profile.service";
import { AssistantInvitationService } from "../../identity/services/assistant-invitation.service";

// §5.2/§8.1: /doctors/me/availability-rules and
// /doctors/me/availability-exceptions are DOCTOR, ASSISTANT — the
// first M4 endpoints needing more than one role, per the
// RolesGuard-deferral comment in assistant-invitations.controller.ts
// ("arrives when more than one module needs it"). Authorization here
// isn't "does the caller have role X" but "which Doctor, if any, can
// this caller act on behalf of for agenda purposes" — resolved from
// the Doctor table itself (caller is the doctor) or from a UserRole
// scope (caller is an assistant for that doctor), never from
// AccessTokenPayload.primaryRole alone.
@Injectable()
export class SchedulingAuthService {
  constructor(
    private readonly doctorProfileService: DoctorProfileService,
    private readonly assistantInvitationService: AssistantInvitationService
  ) {}

  async resolveActingDoctor(userId: string): Promise<Doctor> {
    const ownDoctor = await this.doctorProfileService.findByUserId(userId);
    if (ownDoctor) {
      return ownDoctor;
    }

    const scopedDoctorUserId = await this.assistantInvitationService.getAssistantScope(userId);
    if (scopedDoctorUserId) {
      const scopedDoctor = await this.doctorProfileService.findByUserId(scopedDoctorUserId);
      if (scopedDoctor) {
        return scopedDoctor;
      }
    }

    throw new ApiException(
      "SCHEDULING_NOT_DOCTOR_OR_ASSISTANT",
      "Solo un médico o su asistente puede gestionar esta agenda.",
      HttpStatus.FORBIDDEN
    );
  }
}
