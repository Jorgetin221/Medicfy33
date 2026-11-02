import { Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard, type AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { getRequestMeta } from "../identity/request-meta";
import { PatientAccountAccessService } from "./patient-account-access.service";
import { PatientLinkRequestService } from "./services/patient-link-request.service";

// Solicitudes de vinculación (registro propio con teléfono que coincide
// con expedientes sin cuenta). Solo el médico tratante, nunca su
// asistente: confirmar una identidad es decisión clínica-legal.
@ApiTags("patient-accounts")
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class PatientLinkRequestsController {
  constructor(
    private readonly access: PatientAccountAccessService,
    private readonly linkRequests: PatientLinkRequestService
  ) {}

  @Get("patient-link-requests")
  @ApiOperation({ summary: "Solicitudes pendientes sobre los pacientes con vínculo activo del médico" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: "PATIENT_LINK_DOCTOR_ONLY" })
  async listPending(@Req() req: Request) {
    const actor = await this.access.resolveDoctorOnly((req as AuthenticatedRequest).user.sub);
    return this.linkRequests.listPendingForDoctor(actor);
  }

  @Get("patients/:patientId/link-requests")
  @ApiOperation({ summary: "Solicitudes pendientes de un paciente: datos escritos al registrarse junto a los del expediente" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: "PATIENT_NOT_FOUND (sin vínculo activo)" })
  async listForPatient(@Param("patientId") patientId: string, @Req() req: Request) {
    const actor = await this.access.resolveDoctorOnly((req as AuthenticatedRequest).user.sub);
    return this.linkRequests.listPendingForPatient(patientId, actor);
  }

  @Post("patient-link-requests/:requestId/approve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Vincula cuenta y expediente (una transacción) y cierra las demás solicitudes" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: "PATIENT_LINK_REQUEST_NOT_FOUND" })
  @ApiResponse({ status: 409, description: "PATIENT_LINK_REQUEST_RESOLVED | PATIENT_ALREADY_HAS_ACCOUNT | PATIENT_LINK_USER_ALREADY_LINKED" })
  async approve(@Param("requestId") requestId: string, @Req() req: Request) {
    const actor = await this.access.resolveDoctorOnly((req as AuthenticatedRequest).user.sub);
    await this.linkRequests.approve(requestId, actor, getRequestMeta(req));
    return { approved: true };
  }

  @Post("patient-link-requests/:requestId/reject")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rechaza: la cuenta queda sin expediente vinculado" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: "PATIENT_LINK_REQUEST_NOT_FOUND" })
  @ApiResponse({ status: 409, description: "PATIENT_LINK_REQUEST_RESOLVED" })
  async reject(@Param("requestId") requestId: string, @Req() req: Request) {
    const actor = await this.access.resolveDoctorOnly((req as AuthenticatedRequest).user.sub);
    await this.linkRequests.reject(requestId, actor, getRequestMeta(req));
    return { rejected: true };
  }

  @Get("patients/me/link-status")
  @ApiOperation({ summary: "Portal del paciente: LINKED | PENDING_REVIEW | NONE — nunca cuál expediente coincidió" })
  @ApiResponse({ status: 200 })
  async ownStatus(@Req() req: Request) {
    return { status: await this.linkRequests.ownStatus((req as AuthenticatedRequest).user.sub) };
  }
}
