import { Body, Controller, ForbiddenException, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  assistantAcceptSchema,
  assistantInviteSchema,
  type AssistantAcceptInput,
  type AssistantInviteInput,
} from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { AssistantInvitationService } from "./services/assistant-invitation.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "./guards/jwt-auth.guard";

// Role check is inline here rather than a full RolesGuard — a single
// DOCTOR-only route doesn't justify building the general RBAC matrix
// from spec §5.2 yet; that arrives when more than one module needs it.
@ApiTags("doctors")
@ApiBearerAuth()
@Controller("doctors/me/assistants")
@UseGuards(JwtAuthGuard)
export class AssistantInvitationsController {
  constructor(private readonly invitationService: AssistantInvitationService) {}

  @Post("invite")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "M1-RN-008: hasta 3 invitaciones pendientes, expiran en 72h" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: "Solo DOCTOR puede invitar" })
  @ApiResponse({ status: 409, description: "ASSISTANT_INVITATION_LIMIT_REACHED" })
  async invite(@Body(new ZodValidationPipe(assistantInviteSchema)) body: AssistantInviteInput, @Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    if (user.primaryRole !== "DOCTOR") {
      throw new ForbiddenException("Solo un médico puede invitar asistentes.");
    }
    return this.invitationService.invite(user.sub, body.email);
  }

  // DT-03: previously the only caller of AssistantInvitationService.accept()
  // was the test suite, calling it directly / creating the UserRole row
  // via Prisma — meaning the ASSISTANT role was unreachable through the
  // running API. The accepting user must already be authenticated (any
  // role — there's no dedicated ASSISTANT registration path; they
  // register as PATIENT like anyone else, then this adds the ASSISTANT
  // UserRole on top, scoped to the inviting doctor).
  @Post("accept")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "M1-RN-008: acepta una invitación de asistente, otorga UserRole(ASSISTANT) con scope al médico" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: "ASSISTANT_INVITATION_INVALID" })
  async accept(@Body(new ZodValidationPipe(assistantAcceptSchema)) body: AssistantAcceptInput, @Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    await this.invitationService.accept(body.token, user.sub);
    return { accepted: true };
  }
}
