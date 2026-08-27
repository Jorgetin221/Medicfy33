import { Body, Controller, Get, Param, Patch, Post, Req, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  clinicalEncounterCreateSchema,
  clinicalNoteCorrectionSchema,
  clinicalNoteDraftUpdateSchema,
  clinicalNoteSignSchema,
  type ClinicalEncounterCreateInput,
  type ClinicalNoteCorrectionInput,
  type ClinicalNoteDraftUpdateInput,
  type ClinicalNoteSignInput,
} from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { DoctorVerifiedGuard } from "../identity/guards/doctor-verified.guard";
import { CareRelationshipGuard, type ClinicalRequest } from "../../common/guards/care-relationship.guard";
import { AuditService } from "../identity/services/audit.service";
import { getRequestMeta } from "../identity/request-meta";
import { ClinicalEncounterService } from "./services/clinical-encounter.service";
import { IndicacionesPdfService } from "./services/indicaciones-pdf.service";

// M8-RN-002/DOC-06: crear/listar encuentros de un paciente, autoguardar
// el borrador y firmar. Todas las rutas pasan por CareRelationshipGuard
// (vía patientId directo o resuelto desde encounterId).
@ApiTags("records")
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, CareRelationshipGuard)
export class EncountersController {
  constructor(
    private readonly encounters: ClinicalEncounterService,
    private readonly auditService: AuditService,
    private readonly indicacionesPdf: IndicacionesPdfService
  ) {}

  @Post("records/patients/:patientId/encounters")
  @ApiOperation({ summary: "Inicia un encuentro en DRAFT (M8-RN-002)" })
  async create(
    @Param("patientId") patientId: string,
    @Body(new ZodValidationPipe(clinicalEncounterCreateSchema)) body: ClinicalEncounterCreateInput,
    @Req() req: ClinicalRequest
  ) {
    const encounter = await this.encounters.create(patientId, req.actingDoctorId as string, body);
    await this.audit(req, patientId, "records.encounter.create", encounter.id);
    return encounter;
  }

  @Get("records/patients/:patientId/encounters")
  @ApiOperation({ summary: "Historial de encuentros del paciente" })
  async listForPatient(@Param("patientId") patientId: string, @Req() req: ClinicalRequest) {
    await this.audit(req, patientId, "records.encounter.list");
    return this.encounters.listForPatient(patientId);
  }

  @Get("records/encounters/:encounterId")
  @ApiOperation({ summary: "Detalle de un encuentro (nota + diagnósticos)" })
  async getById(@Param("encounterId") encounterId: string, @Req() req: ClinicalRequest) {
    await this.audit(req, req.clinicalPatientId as string, "records.encounter.read", encounterId);
    return this.encounters.getById(encounterId);
  }

  @Patch("records/encounters/:encounterId/note")
  @ApiOperation({ summary: "Autoguardado cada 10s mientras DRAFT (M8-RN-002)" })
  async updateDraft(
    @Param("encounterId") encounterId: string,
    @Body(new ZodValidationPipe(clinicalNoteDraftUpdateSchema)) body: ClinicalNoteDraftUpdateInput,
    @Req() req: ClinicalRequest
  ) {
    await this.audit(req, req.clinicalPatientId as string, "records.encounter.autosave", encounterId);
    return this.encounters.updateDraft(encounterId, body);
  }

  @Post("records/encounters/:encounterId/sign")
  @UseGuards(DoctorVerifiedGuard)
  @ApiOperation({ summary: "Firma el encuentro: congela la nota, calcula y encadena el hash, completa la cita ligada (M8-RN-001/002, M8-CA-004)" })
  async sign(
    @Param("encounterId") encounterId: string,
    @Body(new ZodValidationPipe(clinicalNoteSignSchema)) body: ClinicalNoteSignInput,
    @Req() req: ClinicalRequest
  ) {
    const result = await this.encounters.signAndCompleteAppointment(encounterId, req.user.sub, body);
    await this.audit(req, req.clinicalPatientId as string, "records.encounter.sign", encounterId);
    return result;
  }

  @Post("records/encounters/:encounterId/correct-note")
  @UseGuards(DoctorVerifiedGuard)
  @ApiOperation({ summary: "Corrige una nota firmada: inserta una nota nueva referenciando la original, nunca UPDATE (M8-RN-001)" })
  async correctNote(
    @Param("encounterId") encounterId: string,
    @Body(new ZodValidationPipe(clinicalNoteCorrectionSchema)) body: ClinicalNoteCorrectionInput,
    @Req() req: ClinicalRequest
  ) {
    const note = await this.encounters.correctNote(encounterId, req.user.sub, body);
    await this.audit(req, req.clinicalPatientId as string, "records.encounter.note.correct", note.id);
    return note;
  }

  // Prompt 37/38A (Fase 4): PDF independiente de INDICACIONES AL
  // PACIENTE desde la nota firmada — el paciente recibe solo lo suyo.
  @Get("records/encounters/:encounterId/indicaciones/pdf")
  @ApiOperation({ summary: "Fase 4 / prompt 38A: PDF de indicaciones al paciente desde la nota firmada" })
  async indicacionesPdfDownload(@Param("encounterId") encounterId: string, @Req() req: ClinicalRequest): Promise<StreamableFile> {
    const { buffer, contentType } = await this.indicacionesPdf.generate(encounterId, req.clinicalPatientId as string, req.user.sub);
    await this.audit(req, req.clinicalPatientId as string, "records.encounter.indicaciones.pdf", encounterId);
    return new StreamableFile(buffer, { type: contentType });
  }

  private async audit(req: ClinicalRequest, patientId: string, action: string, resourceId?: string) {
    const meta = getRequestMeta(req);
    await this.auditService.log({
      actorUserId: req.user.sub,
      actorRole: "DOCTOR",
      action,
      resourceType: "clinical_encounter",
      ...(resourceId !== undefined ? { resourceId } : {}),
      patientId,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}
