import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { MfaService } from "./services/mfa.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "./guards/jwt-auth.guard";

const enrollBodySchema = z.object({ code: z.string().regex(/^\d{6}$/).optional() });
type EnrollBody = z.infer<typeof enrollBodySchema>;

@ApiTags("mfa")
@ApiBearerAuth()
@Controller("auth/mfa")
@UseGuards(JwtAuthGuard)
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  // Single endpoint per the spec's endpoint table (only one "/auth/mfa/
  // enroll" row exists): no code in the body starts enrollment and
  // returns the QR/backup codes; a code in the body confirms a
  // previously started enrollment. This is an inference, not spelled
  // out verbatim in the spec — documented here rather than silently
  // assumed.
  @Post("enroll")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Sin code: inicia enrolamiento TOTP. Con code: lo confirma (M1-RN-005)" })
  @ApiBody({ schema: { type: "object", properties: { code: { type: "string", pattern: "^\\d{6}$" } } } })
  @ApiResponse({ status: 200 })
  async enroll(@Body(new ZodValidationPipe(enrollBodySchema)) body: EnrollBody, @Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    if (body.code) {
      await this.mfaService.confirmEnrollment(user.sub, body.code);
      return { confirmed: true };
    }
    return this.mfaService.startEnrollment(user.sub);
  }

  @Post("disable")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Desactiva MFA para el usuario autenticado" })
  @ApiResponse({ status: 200 })
  async disable(@Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    await this.mfaService.disable(user.sub);
    return { disabled: true };
  }
}
