import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  patientAllergyCreateSchema,
  patientAllergyUpdateSchema,
  patientMedicationCreateSchema,
  patientMedicationUpdateSchema,
  patientHistoryItemUpsertSchema,
  patientHistoryListQuerySchema,
  type PatientAllergyCreateInput,
  type PatientAllergyUpdateInput,
  type PatientMedicationCreateInput,
  type PatientMedicationUpdateInput,
  type PatientHistoryItemUpsertInput,
} from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { CareRelationshipGuard, type ClinicalRequest } from "../../common/guards/care-relationship.guard";
import { AuditService } from "../identity/services/audit.service";
import { getRequestMeta } from "../identity/request-meta";
import { PatientClinicalService } from "./services/patient-clinical.service";

const historyQueryPipe = new ZodValidationPipe(patientHistoryListQuerySchema);

// M8: antecedentes/alergias/medicamentos y línea de tiempo del
// paciente. Toda la clase pasa por CareRelationshipGuard — ningún
// método de aquí responde sin vínculo activo (AUTH-RN-001).
@ApiTags("records")
@ApiBearerAuth()
@Controller("records/patients/:patientId")
@UseGuards(JwtAuthGuard, CareRelationshipGuard)
export class PatientClinicalController {
  constructor(
    private readonly patientClinical: PatientClinicalService,
    private readonly auditService: AuditService
  ) {}

  @Get("allergies")
  @ApiOperation({ summary: "M8-RN-008: alergias registradas del paciente" })
  async listAllergies(@Param("patientId") patientId: string, @Req() req: ClinicalRequest) {
    await this.auditRead(req, patientId, "records.allergies.list");
    return this.patientClinical.listAllergies(patientId);
  }

  @Post("allergies")
  @ApiOperation({ summary: "Registrar una alergia — se captura una vez y se arrastra (M8-RN-012)" })
  async createAllergy(
    @Param("patientId") patientId: string,
    @Body(new ZodValidationPipe(patientAllergyCreateSchema)) body: PatientAllergyCreateInput,
    @Req() req: ClinicalRequest
  ) {
    await this.auditWrite(req, patientId, "records.allergies.create");
    return this.patientClinical.createAllergy(patientId, body);
  }

  @Patch("allergies/:allergyId")
  async updateAllergy(
    @Param("patientId") patientId: string,
    @Param("allergyId") allergyId: string,
    @Body(new ZodValidationPipe(patientAllergyUpdateSchema)) body: PatientAllergyUpdateInput,
    @Req() req: ClinicalRequest
  ) {
    await this.auditWrite(req, patientId, "records.allergies.update");
    return this.patientClinical.updateAllergy(patientId, allergyId, body);
  }

  @Get("medications")
  @ApiOperation({ summary: "M8-RN-012: conciliación de medicamentos habituales" })
  async listMedications(@Param("patientId") patientId: string, @Req() req: ClinicalRequest) {
    await this.auditRead(req, patientId, "records.medications.list");
    return this.patientClinical.listMedications(patientId);
  }

  @Post("medications")
  async createMedication(
    @Param("patientId") patientId: string,
    @Body(new ZodValidationPipe(patientMedicationCreateSchema)) body: PatientMedicationCreateInput,
    @Req() req: ClinicalRequest
  ) {
    await this.auditWrite(req, patientId, "records.medications.create");
    return this.patientClinical.createMedication(patientId, body);
  }

  @Patch("medications/:medicationId")
  async updateMedication(
    @Param("patientId") patientId: string,
    @Param("medicationId") medicationId: string,
    @Body(new ZodValidationPipe(patientMedicationUpdateSchema)) body: PatientMedicationUpdateInput,
    @Req() req: ClinicalRequest
  ) {
    await this.auditWrite(req, patientId, "records.medications.update");
    return this.patientClinical.updateMedication(patientId, medicationId, body);
  }

  @Get("history")
  @ApiOperation({ summary: "M8-RN-012/§10: antecedentes heredofamiliares/personales — se capturan una vez y se arrastran" })
  async listHistory(@Param("patientId") patientId: string, @Query("category") category: string | undefined, @Req() req: ClinicalRequest) {
    await this.auditRead(req, patientId, "records.history.list");
    const query = historyQueryPipe.transform({ category });
    return this.patientClinical.listHistoryItems(patientId, query.category);
  }

  @Post("history")
  @ApiOperation({ summary: "Crea o actualiza un antecedente — versiona el valor anterior antes de sobrescribir (§10.4)" })
  async upsertHistory(
    @Param("patientId") patientId: string,
    @Body(new ZodValidationPipe(patientHistoryItemUpsertSchema)) body: PatientHistoryItemUpsertInput,
    @Req() req: ClinicalRequest
  ) {
    await this.auditWrite(req, patientId, "records.history.upsert");
    return this.patientClinical.upsertHistoryItem(patientId, req.user.sub, body);
  }

  @Get("timeline")
  @ApiOperation({ summary: "§6.5.8: expediente cronológico — encuentros, recetas, órdenes" })
  async timeline(@Param("patientId") patientId: string, @Req() req: ClinicalRequest) {
    await this.auditRead(req, patientId, "records.timeline.read");
    return this.patientClinical.timeline(patientId);
  }

  // R3: toda lectura de dato clínico se registra antes de responder.
  // El caso DENIED ya lo cubre CareRelationshipGuard; esto cubre el
  // SUCCESS con la acción específica de cada endpoint.
  private async auditRead(req: ClinicalRequest, patientId: string, action: string) {
    const meta = getRequestMeta(req);
    await this.auditService.log({
      actorUserId: req.user.sub,
      actorRole: "DOCTOR",
      action,
      resourceType: "patient",
      resourceId: patientId,
      patientId,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  private async auditWrite(req: ClinicalRequest, patientId: string, action: string) {
    return this.auditRead(req, patientId, action);
  }
}
