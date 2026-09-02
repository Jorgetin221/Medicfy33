import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { labResultAnalyteCreateSchema, type LabResultAnalyteCreateInput } from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { CareRelationshipGuard, type ClinicalRequest } from "../../common/guards/care-relationship.guard";
import { AuditService } from "../identity/services/audit.service";
import { getRequestMeta } from "../identity/request-meta";
import { PrismaService } from "../../prisma/prisma.service";
import { LabResultAnalyteService } from "./services/lab-result-analyte.service";
import { LabReferenceRangeService } from "./services/lab-reference-range.service";

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
    private readonly ranges: LabReferenceRangeService,
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService
  ) {}

  // Capa 2 (v2.5): el estado ya NO se calcula en el cliente
  // (analyteStatus() en lab-analytes-panel.tsx quedó retirado) — el
  // servidor es la única autoridad (M10-RN-008). referenceMin/Max ya
  // guardados en la fila SON el rango impreso/manual (prioridad 1);
  // sin ellos, se resuelve contra lab_reference_ranges (prioridad 2).
  @Get()
  @ApiOperation({ summary: "Prompt 42A + Capa 2 (v2.5): serie de analitos del paciente, con estado ya calculado por el servidor" })
  async list(@Param("patientId") patientId: string, @Req() req: ClinicalRequest) {
    await this.audit(req, patientId, "lab_analytes.list");
    const [rows, patient] = await Promise.all([
      this.analytes.listForPatient(patientId),
      this.prisma.patient.findUnique({ where: { id: patientId }, select: { sexAtBirth: true, birthDate: true } }),
    ]);
    if (!patient) return rows;

    const sex = patient.sexAtBirth === "F" ? "F" : "M";
    return Promise.all(
      rows.map(async (a) => {
        const ageYears = (a.measuredAt.getTime() - patient.birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        const printedRange =
          a.referenceMin !== null && a.referenceMax !== null ? { min: Number(a.referenceMin), max: Number(a.referenceMax) } : null;
        const evaluation = await this.ranges.evaluateForAnalyte(a.analyteName, Number(a.value), sex, ageYears, printedRange);
        return { ...a, ...evaluation };
      })
    );
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
