import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { rejectDoctorSchema, verifyDoctorSchema, type RejectDoctorInput, type VerifyDoctorInput } from "@medicfy/contracts";
import type { DoctorVerificationStatus } from "@prisma/client";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { AdminGuard } from "../identity/guards/admin.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { getRequestMeta } from "../identity/request-meta";
import { DoctorVerificationService } from "./services/doctor-verification.service";

// Minimal admin surface built ahead of M13 — see
// DoctorVerificationService for why M2-CA-003/004 need it now.
@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin/doctors")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminDoctorsController {
  constructor(private readonly verificationService: DoctorVerificationService) {}

  @Get()
  @ApiQuery({ name: "verification_status", required: false })
  @ApiOperation({ summary: "M2-CA-003: cola de verificación, opcionalmente filtrada por estado" })
  async list(@Query("verification_status") status?: DoctorVerificationStatus) {
    return this.verificationService.listQueue(status);
  }

  @Get(":id")
  @ApiOperation({ summary: "M2-CA-003: detalle de un médico con sus documentos y hash" })
  async detail(@Param("id") id: string) {
    return this.verificationService.getDetail(id);
  }

  @Post(":id/verify")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Aprueba la verificación del médico; specialtyConfirmed=false → VERIFIED_SPECIALTY_UNCONFIRMED (Parte B §5.2)" })
  @ApiResponse({ status: 200 })
  async verify(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(verifyDoctorSchema)) body: VerifyDoctorInput,
    @Req() req: Request
  ) {
    const { user } = req as AuthenticatedRequest;
    return this.verificationService.verify(id, user.sub, getRequestMeta(req), body.specialtyConfirmed);
  }

  // ZodValidationPipe is bound to the @Body() parameter directly, not
  // via method-level @UsePipes() — a method-level pipe runs against
  // every parameter the handler takes, including @Param("id"), which
  // broke this exact route (a plain string run through an object
  // schema) until the M2-CA-003 test caught it.
  @Post(":id/reject")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rechaza con motivo obligatorio (M2-CA-003)" })
  @ApiResponse({ status: 200 })
  async reject(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(rejectDoctorSchema)) body: RejectDoctorInput,
    @Req() req: Request
  ) {
    const { user } = req as AuthenticatedRequest;
    return this.verificationService.reject(id, body.reason, user.sub, getRequestMeta(req));
  }

  @Post(":id/suspend")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "M2-RN-005: suspende, cancela citas futuras pagadas y notifica reembolso de 100%; el cobro real espera a M6" })
  @ApiResponse({ status: 200 })
  async suspend(@Param("id") id: string, @Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    return this.verificationService.suspend(id, user.sub, getRequestMeta(req));
  }
}
