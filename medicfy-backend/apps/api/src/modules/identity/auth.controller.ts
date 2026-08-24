import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import {
  emailVerifySchema,
  loginSchema,
  mfaLoginVerifySchema,
  passwordForgotSchema,
  passwordResetSchema,
  phoneVerifySchema,
  registerDoctorSchema,
  registerPatientSchema,
  type EmailVerifyInput,
  type LoginInput,
  type MfaLoginVerifyInput,
  type PasswordForgotInput,
  type PasswordResetInput,
  type PhoneVerifyInput,
  type RegisterDoctorInput,
  type RegisterPatientInput,
} from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { ApiException } from "../../common/api-exception";
import { AuthService } from "./services/auth.service";
import { getRequestMeta } from "./request-meta";
import { REFRESH_COOKIE_NAME, clearRefreshCookie, setRefreshCookie } from "./refresh-cookie";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register/patient")
  @ApiOperation({ summary: "M1-RN-001/003: registro de paciente con consentimiento explícito de 3 casillas" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["email", "password", "phone", "consents"],
      properties: {
        email: { type: "string", format: "email" },
        password: { type: "string", minLength: 12 },
        phone: { type: "string", example: "+523312345678" },
        consents: {
          type: "object",
          required: ["privacyNotice", "sensitiveData", "digitalPrescriptionChannel"],
          properties: {
            privacyNotice: { type: "boolean", enum: [true], description: "Obligatorio (M1-RN-003)" },
            sensitiveData: { type: "boolean", enum: [true], description: "Obligatorio (M1-RN-003)" },
            digitalPrescriptionChannel: { type: "boolean" },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: "Cuenta creada, email de verificación enviado" })
  @ApiResponse({ status: 400, description: "VALIDATION_ERROR" })
  @ApiResponse({ status: 409, description: "EMAIL_ALREADY_REGISTERED" })
  async registerPatient(@Body(new ZodValidationPipe(registerPatientSchema)) body: RegisterPatientInput, @Req() req: Request) {
    return this.authService.registerPatient(body, getRequestMeta(req));
  }

  @Post("register/doctor")
  @ApiOperation({ summary: "M1-RN-002: registro de médico, queda en verification_status=SUBMITTED" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["email", "password", "legalFirstName", "legalLastName", "professionalLicense", "primarySpecialtyCode", "phone"],
      properties: {
        email: { type: "string", format: "email" },
        password: { type: "string", minLength: 12 },
        legalFirstName: { type: "string" },
        legalLastName: { type: "string" },
        professionalLicense: { type: "string", example: "1234567" },
        primarySpecialtyCode: { type: "string", example: "GENERAL" },
        phone: { type: "string", example: "+523312345678" },
      },
    },
  })
  @ApiResponse({ status: 201, description: "Cuenta creada, email de verificación enviado" })
  @ApiResponse({ status: 400, description: "VALIDATION_ERROR" })
  @ApiResponse({ status: 409, description: "EMAIL_ALREADY_REGISTERED | CEDULA_ALREADY_REGISTERED" })
  async registerDoctor(@Body(new ZodValidationPipe(registerDoctorSchema)) body: RegisterDoctorInput, @Req() req: Request) {
    return this.authService.registerDoctor(body, getRequestMeta(req));
  }

  @Post("email/verify")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Flow step 2: código de 6 dígitos, 10 min de vigencia" })
  @ApiResponse({ status: 200, description: "Email verificado, cuenta pasa a ACTIVE" })
  @ApiResponse({ status: 400, description: "VERIFICATION_CODE_INVALID" })
  async verifyEmail(@Body(new ZodValidationPipe(emailVerifySchema)) body: EmailVerifyInput) {
    await this.authService.verifyEmail(body.userId, body.code);
    return { verified: true };
  }

  @Post("phone/verify")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verificación de teléfono, código de 6 dígitos" })
  @ApiResponse({ status: 200, description: "Teléfono verificado" })
  @ApiResponse({ status: 400, description: "VERIFICATION_CODE_INVALID" })
  async verifyPhone(@Body(new ZodValidationPipe(phoneVerifySchema)) body: PhoneVerifyInput) {
    await this.authService.verifyPhone(body.userId, body.code);
    return { verified: true };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "M1-RN-004/005/006: consentimiento vigente, MFA y bloqueo por fuerza bruta" })
  @ApiResponse({ status: 200, description: "accessToken en el cuerpo; refresh token en cookie httpOnly" })
  @ApiResponse({ status: 401, description: "AUTH_INVALID_CREDENTIALS" })
  @ApiResponse({ status: 403, description: "AUTH_EMAIL_NOT_VERIFIED" })
  @ApiResponse({ status: 423, description: "AUTH_ACCOUNT_LOCKED" })
  @ApiResponse({ status: 428, description: "AUTH_MFA_REQUIRED" })
  @ApiResponse({ status: 451, description: "AUTH_CONSENT_REQUIRED" })
  async login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(body.email, body.password, getRequestMeta(req));
    if ("mfaRequired" in result) {
      return { mfaRequired: true, mfaSessionToken: result.mfaSessionToken };
    }
    setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken };
  }

  @Post("mfa/verify")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Completa un login pendiente de MFA con el mfaSessionToken parcial" })
  @ApiResponse({ status: 200, description: "accessToken en el cuerpo; refresh token en cookie httpOnly" })
  @ApiResponse({ status: 401, description: "AUTH_INVALID_CREDENTIALS" })
  async verifyMfaLogin(
    @Body(new ZodValidationPipe(mfaLoginVerifySchema)) body: MfaLoginVerifyInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.completeMfaLogin(body.mfaSessionToken, body.code, getRequestMeta(req));
    setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken };
  }

  // Cookie-authenticated, not Bearer-authenticated — see AuthService
  // for why a still-valid access token would make this pointless.
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "M1-RN-007: rota el refresh token (cookie httpOnly), respeta idle-timeout por rol" })
  @ApiResponse({ status: 200, description: "Nuevo accessToken; refresh rotado en cookie" })
  @ApiResponse({ status: 401, description: "AUTH_INVALID_CREDENTIALS (sesión inválida, expirada o idle_timeout)" })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const plainToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (!plainToken) {
      throw new ApiException("AUTH_INVALID_CREDENTIALS", "No hay sesión activa.", HttpStatus.UNAUTHORIZED);
    }
    const result = await this.authService.refresh(plainToken);
    setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken };
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Revoca la sesión asociada al refresh token en cookie" })
  @ApiResponse({ status: 200 })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const plainToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (plainToken) {
      await this.authService.logout(plainToken);
    }
    clearRefreshCookie(res);
    return { loggedOut: true };
  }

  @Post("password/forgot")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Siempre responde igual, exista o no la cuenta" })
  @ApiResponse({ status: 200 })
  async forgotPassword(@Body(new ZodValidationPipe(passwordForgotSchema)) body: PasswordForgotInput) {
    await this.authService.forgotPassword(body.email);
    return { requested: true };
  }

  @Post("password/reset")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Consume el token de un solo uso y revoca todas las sesiones activas" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: "PASSWORD_RESET_TOKEN_INVALID" })
  async resetPassword(@Body(new ZodValidationPipe(passwordResetSchema)) body: PasswordResetInput) {
    await this.authService.resetPassword(body.token, body.newPassword);
    return { reset: true };
  }
}
