import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { MfaService } from "./services/mfa.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { getRequestMeta } from "./request-meta";
import type { AuthenticatedRequest } from "./guards/jwt-auth.guard";

const enrollBodySchema = z.object({ code: z.string().regex(/^\d{6}$/).optional() });
type EnrollBody = z.infer<typeof enrollBodySchema>;

// A-27: TOTP de 6 dígitos o código de respaldo (10 caracteres hex).
const disableBodySchema = z.object({
  password: z.string().min(1).max(128),
  code: z.string().regex(/^(\d{6}|[0-9a-f]{10})$/i),
});
type DisableBody = z.infer<typeof disableBodySchema>;

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
  @ApiResponse({ status: 409, description: "MFA ya activo" })
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
  @ApiOperation({ summary: "Desactiva MFA; exige contraseña y código vigente (TOTP o respaldo)" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["password", "code"],
      properties: { password: { type: "string" }, code: { type: "string" } },
    },
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401, description: "Contraseña o código incorrectos" })
  async disable(@Body(new ZodValidationPipe(disableBodySchema)) body: DisableBody, @Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    await this.mfaService.disable(user.sub, body.password, body.code.toLowerCase(), getRequestMeta(req));
    return { disabled: true };
  }
}
