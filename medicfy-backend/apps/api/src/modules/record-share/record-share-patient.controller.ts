import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { recordShareDecisionInputSchema, type RecordShareDecisionInput } from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { getRequestMeta } from "../identity/request-meta";
import { RecordSharePatientInboxService } from "./services/record-share-patient-inbox.service";

// Bandeja del paciente con cuenta: solicitudes para compartir su
// expediente y accesos que autorizó. Todo se resuelve por el usuario de
// la sesión — un usuario sin expediente propio ve listas vacías.
@ApiTags("record-share")
@ApiBearerAuth()
@Controller("record-share/me")
@UseGuards(JwtAuthGuard)
export class RecordSharePatientController {
  constructor(private readonly inbox: RecordSharePatientInboxService) {}

  @Get("requests")
  @ApiOperation({ summary: "Solicitudes pendientes de autorizar (campana del paciente) — nunca dato clínico" })
  @ApiResponse({ status: 200 })
  async listRequests(@Req() req: Request) {
    return this.inbox.listPendingRequests((req as AuthenticatedRequest).user.sub);
  }

  @Post("requests/:requestId/decide")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Aprobar (nunca amplía lo solicitado) o rechazar con la sesión iniciada — method PATIENT_SESSION" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: "RECORD_SHARE_REQUEST_NOT_FOUND" })
  @ApiResponse({ status: 409, description: "RECORD_SHARE_REQUEST_NOT_PENDING" })
  @ApiResponse({ status: 422, description: "RECORD_SHARE_SCOPE_EXCEEDS_REQUEST | RECORD_SHARE_DURATION_EXCEEDS_REQUEST" })
  async decide(
    @Param("requestId") requestId: string,
    @Body(new ZodValidationPipe(recordShareDecisionInputSchema)) body: RecordShareDecisionInput,
    @Req() req: Request
  ) {
    return this.inbox.decide((req as AuthenticatedRequest).user.sub, requestId, body, getRequestMeta(req));
  }

  @Get("grants")
  @ApiOperation({ summary: "Accesos que el paciente autorizó: vigentes y los últimos terminados" })
  @ApiResponse({ status: 200 })
  async listGrants(@Req() req: Request) {
    return this.inbox.listGrants((req as AuthenticatedRequest).user.sub);
  }

  @Post("grants/:grantId/revoke")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Revoca un acceso vigente — bloqueo inmediato" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: "RECORD_SHARE_GRANT_NOT_ACTIVE" })
  async revoke(@Param("grantId") grantId: string, @Req() req: Request) {
    return this.inbox.revoke((req as AuthenticatedRequest).user.sub, grantId, getRequestMeta(req));
  }
}
