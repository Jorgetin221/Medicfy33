import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { labResultAnalyteCreateSchema, type LabResultAnalyteCreateInput } from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { CareRelationshipGuard, type ClinicalRequest } from "../../common/guards/care-relationship.guard";
import { AuditService } from "../identity/services/audit.service";
import { getRequestMeta } from "../identity/request-meta";
import { LabResultAnalyteService } from "./services/lab-result-analyte.service";

// Fase 5 · Prompt 42A: analitos ESTRUCTURADOS (nombre, valor, unidad,
// rango de referencia) — nunca un PDF adjunto ni un número de orden;
// eso ya lo cubre LabResultsController. Mismo patrón de guardias y
// auditoría que el resto de records/labs.
@ApiTags("labs")
@ApiBearerAuth()
@Controller("lab-analytes/patients/:patientId")
@UseGuards(JwtAuthGuard, CareRelationshipGuard)
export class LabResultAnalytesController {
  constructor(
    private readonly analytes: LabResultAnalyteService,
    private readonly auditService: AuditService
  ) {}

  @Get()
  @ApiOperation({ summary: "Prompt 42A: serie estructurada de analitos del paciente" })
  async list(@Param("patientId") patientId: string, @Req() req: ClinicalRequest) {
    await this.audit(req, patientId, "lab_analytes.list");
    return this.analytes.listForPatient(patientId);
  }

  @Post()
  @ApiOperation({ summary: "Prompt 42A: captura manual de un analito — nombre, valor, unidad, rango de referencia" })
  async create(
    @Param("patientId") patientId: string,
    @Body(new ZodValidationPipe(labResultAnalyteCreateSchema)) body: LabResultAnalyteCreateInput,
    @Req() req: ClinicalRequest
  ) {
    const analyte = await this.analytes.create(patientId, req.user.sub, body);
    await this.audit(req, patientId, "lab_analytes.create", analyte.id);
    return analyte;
  }

  @Post(":analyteId/review")
  @ApiOperation({ summary: "Prompt 42A: marca un analito como revisado — deja constancia de quién y cuándo" })
  async review(
    @Param("patientId") patientId: string,
    @Param("analyteId") analyteId: string,
    @Req() req: ClinicalRequest
  ) {
    const analyte = await this.analytes.markReviewed(analyteId, patientId, req.actingDoctorId as string);
    await this.audit(req, patientId, "lab_analytes.review", analyteId);
    return analyte;
  }

  private async audit(req: ClinicalRequest, patientId: string, action: string, resourceId?: string) {
    const meta = getRequestMeta(req);
    await this.auditService.log({
      actorUserId: req.user.sub,
      actorRole: "DOCTOR",
      action,
      resourceType: "lab_result_analyte",
      ...(resourceId !== undefined ? { resourceId } : {}),
      patientId,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}
