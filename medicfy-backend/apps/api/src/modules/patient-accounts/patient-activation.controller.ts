import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { patientActivationSubmitSchema, type PatientActivationSubmitInput } from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { AuthThrottle } from "../../common/rate-limit";
import { getRequestMeta } from "../identity/request-meta";
import { setRefreshCookie } from "../identity/refresh-cookie";
import { PatientActivationService } from "./services/patient-activation.service";

// Página pública /activar-cuenta/[token] — SIN JwtAuthGuard a propósito
// (mismo patrón que record-share/authorize y password/reset): el token
// del enlace es el único "login" que existe aquí. AuthThrottle en las
// dos rutas: límite por IP contra quien intente adivinar tokens.
@ApiTags("patient-accounts")
@Controller("patient-activation")
export class PatientActivationController {
  constructor(private readonly activation: PatientActivationService) {}

  @Get(":token")
  @AuthThrottle()
  @ApiOperation({ summary: "Valida el enlace y devuelve solo nombre de pila y Medicfy ID — nunca dato clínico" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: "PATIENT_ACTIVATION_LINK_INVALID" })
  @ApiResponse({ status: 429, description: "Demasiados intentos desde esta IP" })
  async getInfo(@Param("token") token: string) {
    return this.activation.getInfo(token);
  }

  @Post(":token")
  @AuthThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Crea (o vincula) la cuenta, consume el enlace de un solo uso e inicia sesión — una transacción" })
  @ApiResponse({ status: 200, description: "accessToken en el cuerpo; refresh token en cookie httpOnly" })
  @ApiResponse({ status: 401, description: "AUTH_INVALID_CREDENTIALS (correo ya registrado con otra contraseña)" })
  @ApiResponse({ status: 404, description: "PATIENT_ACTIVATION_LINK_INVALID" })
  @ApiResponse({ status: 409, description: "PATIENT_ACTIVATION_ACCOUNT_NOT_ELIGIBLE" })
  @ApiResponse({ status: 429, description: "Demasiados intentos desde esta IP" })
  async activate(
    @Param("token") token: string,
    @Body(new ZodValidationPipe(patientActivationSubmitSchema)) body: PatientActivationSubmitInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const tokens = await this.activation.activate(token, body, getRequestMeta(req));
    setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }
}
