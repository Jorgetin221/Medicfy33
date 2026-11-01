import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { recordShareDecisionInputSchema, recordShareOtpVerifySchema, type RecordShareDecisionInput, type RecordShareOtpVerifyInput } from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { AuthThrottle } from "../../common/rate-limit";
import { getRequestMeta } from "../identity/request-meta";
import { RecordShareAuthorizationService } from "./services/record-share-authorization.service";

// PR-EXP-03: página pública de autorización del paciente — SIN
// JwtAuthGuard a propósito (mismo patrón que verification.controller.ts
// y auth.service.ts forgotPassword/resetPassword, 00-DESCUBRIMIENTO.md
// Q5). El token en la URL es el único "login" que existe aquí.
@ApiTags("record-share")
@Controller("record-share/authorize")
export class RecordShareAuthorizationController {
  constructor(private readonly authorization: RecordShareAuthorizationService) {}

  @Get(":token")
  @ApiOperation({ summary: "Info segura para decidir — nunca dato clínico ni del custodio (RE9)" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: "RECORD_SHARE_LINK_INVALID" })
  async getInfo(@Param("token") token: string) {
    return this.authorization.getInfo(token);
  }

  @Post(":token/otp")
  @AuthThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Envía/reenvía el código — sección B: máx. 3 reenvíos, bloqueo 1h al agotar intentos" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 429, description: "RECORD_SHARE_OTP_LOCKED | RECORD_SHARE_OTP_RESEND_LIMIT" })
  async requestOtp(@Param("token") token: string, @Req() req: Request) {
    await this.authorization.requestOtp(token, getRequestMeta(req));
    return { sent: true };
  }

  @Post(":token/otp/verify")
  @AuthThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Valida el código — comparación en tiempo constante (RESTRICCIÓN explícita de PR-EXP-03)" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: "RECORD_SHARE_OTP_INVALID" })
  @ApiResponse({ status: 429, description: "RECORD_SHARE_OTP_LOCKED" })
  async verifyOtp(
    @Param("token") token: string,
    @Body(new ZodValidationPipe(recordShareOtpVerifySchema)) body: RecordShareOtpVerifyInput,
    @Req() req: Request
  ) {
    await this.authorization.verifyOtp(token, body.code, getRequestMeta(req));
    return { verified: true };
  }

  @Post(":token/decide")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Aprobar (nunca amplía lo solicitado) o rechazar — transacción única, RE1" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: "RECORD_SHARE_OTP_NOT_VERIFIED" })
  @ApiResponse({ status: 422, description: "RECORD_SHARE_SCOPE_EXCEEDS_REQUEST | RECORD_SHARE_DURATION_EXCEEDS_REQUEST" })
  async decide(
    @Param("token") token: string,
    @Body(new ZodValidationPipe(recordShareDecisionInputSchema)) body: RecordShareDecisionInput,
    @Req() req: Request
  ) {
    return this.authorization.decide(token, body, getRequestMeta(req));
  }
}
