import { Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard, type AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { PatientAccountAccessService } from "./patient-account-access.service";
import { PatientActivationService } from "./services/patient-activation.service";

// Ficha del paciente (vista del médico o su asistente): estado de la
// cuenta y generación del enlace de activación.
@ApiTags("patient-accounts")
@ApiBearerAuth()
@Controller("patients/:patientId")
@UseGuards(JwtAuthGuard)
export class PatientAccountLinksController {
  constructor(
    private readonly access: PatientAccountAccessService,
    private readonly activation: PatientActivationService
  ) {}

  @Get("account-status")
  @ApiOperation({ summary: "¿Tiene cuenta? ¿Es menor? ¿Hay enlace vigente o solicitudes de vinculación pendientes?" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: "PATIENT_NOT_FOUND (sin vínculo activo)" })
  async getAccountStatus(@Param("patientId") patientId: string, @Req() req: Request) {
    const actor = await this.access.resolveDoctorOrAssistant((req as AuthenticatedRequest).user.sub);
    return this.activation.getAccountStatus(patientId, actor);
  }

  @Post("activation-link")
  @ApiOperation({ summary: "Genera el enlace de activación (7 días, un solo uso) y revoca el anterior pendiente" })
  @ApiResponse({ status: 201, description: "{ url, expiresAt } — el token solo se muestra esta vez" })
  @ApiResponse({ status: 404, description: "PATIENT_NOT_FOUND (sin vínculo activo)" })
  @ApiResponse({ status: 409, description: "PATIENT_ALREADY_HAS_ACCOUNT" })
  @ApiResponse({ status: 422, description: "PATIENT_ACTIVATION_MINOR_UNSUPPORTED" })
  async issueLink(@Param("patientId") patientId: string, @Req() req: Request) {
    const actor = await this.access.resolveDoctorOrAssistant((req as AuthenticatedRequest).user.sub);
    return this.activation.issueLink(patientId, actor);
  }
}
