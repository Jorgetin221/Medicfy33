import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { recordShareOtpVerifySchema, recordShareRevokeInputSchema, type RecordShareOtpVerifyInput, type RecordShareRevokeInput } from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { AuthThrottle } from "../../common/rate-limit";
import { getRequestMeta } from "../identity/request-meta";
import { RecordShareRevocationService } from "./services/record-share-revocation.service";

// PR-EXP-06: página pública de revocación del paciente — SIN
// JwtAuthGuard a propósito, mismo patrón que la de autorización
// (PR-EXP-03). El token del enlace de la confirmación es el "login";
// el OTP (propósito REVOKE) confirma que es el paciente.
@ApiTags("record-share")
@Controller("record-share/revoke")
export class RecordShareRevocationController {
  constructor(private readonly revocation: RecordShareRevocationService) {}

  @Get(":token")
  @ApiOperation({ summary: "Accesos vigentes del paciente — sin dato clínico (RE9)" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: "RECORD_SHARE_LINK_INVALID" })
  async getInfo(@Param("token") token: string) {
    return this.revocation.getInfo(token);
  }

  @Post(":token/otp")
  @AuthThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Envía/reenvía el código de revocación — mismos límites que la autorización (sección B)" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 429, description: "RECORD_SHARE_OTP_LOCKED | RECORD_SHARE_OTP_RESEND_LIMIT" })
  async requestOtp(@Param("token") token: string, @Req() req: Request) {
    await this.revocation.requestOtp(token, getRequestMeta(req));
    return { sent: true };
  }

  @Post(":token/otp/verify")
  @AuthThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Valida el código de revocación en tiempo constante" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: "RECORD_SHARE_OTP_INVALID" })
  async verifyOtp(
    @Param("token") token: string,
    @Body(new ZodValidationPipe(recordShareOtpVerifySchema)) body: RecordShareOtpVerifyInput,
    @Req() req: Request
  ) {
    await this.revocation.verifyOtp(token, body.code, getRequestMeta(req));
    return { verified: true };
  }

  @Post(":token/revoke")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Revoca un acceso vigente del paciente — efecto inmediato (el guard revisa status en cada request)" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: "RECORD_SHARE_OTP_NOT_VERIFIED" })
  @ApiResponse({ status: 404, description: "RECORD_SHARE_LINK_INVALID" })
  async revoke(
    @Param("token") token: string,
    @Body(new ZodValidationPipe(recordShareRevokeInputSchema)) body: RecordShareRevokeInput,
    @Req() req: Request
  ) {
    return this.revocation.revoke(token, body.grantId, getRequestMeta(req));
  }
}
