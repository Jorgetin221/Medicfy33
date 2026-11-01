import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { recordShareAbuseReportInputSchema, type RecordShareAbuseReportInput } from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CareRelationshipGuard, type ClinicalRequest } from "../../common/guards/care-relationship.guard";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { getRequestMeta } from "../identity/request-meta";
import { RecordShareOversightService } from "./services/record-share-oversight.service";

// PR-EXP-06: pestaña "Compartido" del perfil del paciente. Detrás de
// CareRelationshipGuard (R4) — y además el servicio filtra por
// custodianDoctorId = médico actuante: un médico con vínculo pero que
// no es el custodio de ese grant no lo ve.
@ApiTags("record-share")
@ApiBearerAuth()
@Controller("record-share/patients/:patientId")
@UseGuards(JwtAuthGuard, CareRelationshipGuard)
export class RecordShareCustodianController {
  constructor(private readonly oversight: RecordShareOversightService) {}

  @Get("shares")
  @ApiOperation({ summary: "Quién tiene/tuvo acceso compartido a este paciente y cuándo lo consultó" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: "CARE_RELATIONSHIP_REQUIRED" })
  async list(@Param("patientId") patientId: string, @Req() req: Request) {
    const clinicalReq = req as ClinicalRequest;
    return this.oversight.listForCustodian(clinicalReq.user.sub, clinicalReq.actingDoctorId as string, patientId, getRequestMeta(req));
  }

  @Post("grants/:grantId/report-abuse")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reporta un uso indebido — llega a la cola del administrador (audit_log)" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: "RECORD_SHARE_GRANT_NOT_FOUND" })
  async reportAbuse(
    @Param("patientId") patientId: string,
    @Param("grantId") grantId: string,
    @Body(new ZodValidationPipe(recordShareAbuseReportInputSchema)) body: RecordShareAbuseReportInput,
    @Req() req: Request
  ) {
    const clinicalReq = req as ClinicalRequest;
    await this.oversight.reportAbuse(clinicalReq.user.sub, clinicalReq.actingDoctorId as string, patientId, grantId, body.reason, getRequestMeta(req));
    return { reported: true };
  }
}
