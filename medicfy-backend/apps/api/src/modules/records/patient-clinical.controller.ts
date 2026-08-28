import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  gynecoHistoryUpsertSchema,
  patientAllergyCatalogCreateSchema,
  patientAllergyUpdateSchema,
  patientMedicationCreateSchema,
  patientMedicationUpdateSchema,
  patientHistoryItemUpsertSchema,
  patientHistoryListQuerySchema,
  patientPregnancyCreateSchema,
  patientPregnancyUpdateSchema,
  substanceUseUpsertSchema,
  notesTimelineQuerySchema,
  type GynecoHistoryUpsertInput,
  type PatientAllergyCatalogCreateInput,
  type PatientAllergyUpdateInput,
  type PatientMedicationCreateInput,
  type PatientMedicationUpdateInput,
  type PatientHistoryItemUpsertInput,
  type PatientPregnancyCreateInput,
  type PatientPregnancyUpdateInput,
  type SubstanceUseUpsertInput,
  type NotesTimelineQueryInput,
} from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { CareRelationshipGuard, type ClinicalRequest } from "../../common/guards/care-relationship.guard";
import { AuditService } from "../identity/services/audit.service";
import { getRequestMeta } from "../identity/request-meta";
import { PatientClinicalService } from "./services/patient-clinical.service";
import { AntecedentesTemplateService } from "./services/antecedentes-template.service";
import { NoteIntegrityService } from "./services/note-integrity.service";

const historyQueryPipe = new ZodValidationPipe(patientHistoryListQuerySchema);
const notesTimelineQueryPipe = new ZodValidationPipe(notesTimelineQuerySchema);

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
    private readonly antecedentesTemplates: AntecedentesTemplateService,
    private readonly auditService: AuditService,
    private readonly noteIntegrity: NoteIntegrityService
  ) {}

  @Get("allergies")
  @ApiOperation({ summary: "M8-RN-008: alergias registradas del paciente" })
  async listAllergies(@Param("patientId") patientId: string, @Req() req: ClinicalRequest) {
    await this.auditRead(req, patientId, "records.allergies.list");
    return this.patientClinical.listAllergies(patientId);
  }

  @Post("allergies")
  @ApiOperation({ summary: "Prompt 23A: registrar alergia con agente DEL CATÁLOGO (M8-RN-012)" })
  async createAllergy(
    @Param("patientId") patientId: string,
    @Body(new ZodValidationPipe(patientAllergyCatalogCreateSchema)) body: PatientAllergyCatalogCreateInput,
    @Req() req: ClinicalRequest
  ) {
    await this.auditWrite(req, patientId, "records.allergies.create");
    return this.patientClinical.createAllergyFromCatalog(patientId, body);
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

  // ── Fase 3 · Prompts 28 y 30 ─────────────────────────────────────

  @Get("vitals-history")
  @ApiOperation({ summary: "Prompt 30: serie de signos vitales ESTRUCTURADA — sin procesar texto" })
  async vitalsHistory(@Param("patientId") patientId: string, @Req() req: ClinicalRequest) {
    await this.auditRead(req, patientId, "records.vitalsHistory.read");
    return this.patientClinical.vitalsHistory(patientId);
  }

  @Get("growth-curves")
  @ApiOperation({ summary: "Prompt 30 (pediatría): curvas de percentilas OMS/CDC para el sexo del paciente" })
  async growthCurves(
    @Param("patientId") patientId: string,
    @Query("measure") measure: string | undefined,
    @Req() req: ClinicalRequest
  ) {
    await this.auditRead(req, patientId, "records.growthCurves.read");
    const parsed = measure === "HEIGHT_FOR_AGE" ? "HEIGHT_FOR_AGE" : "WEIGHT_FOR_AGE";
    return this.patientClinical.growthCurves(patientId, parsed);
  }

  @Post("diagnoses/:diagnosisId/discard")
  @ApiOperation({ summary: "Prompt 28: descartar no borra — DESCARTADO con fecha y autor, fuera de vigentes" })
  async discardDiagnosis(
    @Param("patientId") patientId: string,
    @Param("diagnosisId") diagnosisId: string,
    @Req() req: ClinicalRequest
  ) {
    await this.auditWrite(req, patientId, "records.diagnosis.discard");
    return this.patientClinical.discardDiagnosis(patientId, diagnosisId, req.user.sub);
  }

  // ── Fase 2 · Prompt 21: toxicomanías ─────────────────────────────

  @Get("substance-uses")
  @ApiOperation({ summary: "Toxicomanías del paciente, con índices calculados en servidor" })
  async listSubstanceUses(@Param("patientId") patientId: string, @Req() req: ClinicalRequest) {
    await this.auditRead(req, patientId, "records.substanceUses.list");
    return this.patientClinical.listSubstanceUses(patientId);
  }

  @Post("substance-uses")
  @ApiOperation({ summary: "Alta/actualización de toxicomanía — cantidad obligatoria si activo/suspendido; índices con fórmula y versión" })
  async upsertSubstanceUse(
    @Param("patientId") patientId: string,
    @Body(new ZodValidationPipe(substanceUseUpsertSchema)) body: SubstanceUseUpsertInput,
    @Req() req: ClinicalRequest
  ) {
    await this.auditWrite(req, patientId, "records.substanceUses.upsert");
    return this.patientClinical.upsertSubstanceUse(patientId, req.user.sub, body);
  }

  // ── Fase 2 · Prompt 22: gineco-obstétricos condicionados ─────────

  @Get("gyneco-history")
  @ApiOperation({ summary: "Bloque gineco-obstétrico — oculto para sexo M sin habilitación explícita" })
  async getGyneco(@Param("patientId") patientId: string, @Req() req: ClinicalRequest) {
    await this.auditRead(req, patientId, "records.gyneco.read");
    return this.patientClinical.getGynecoHistory(patientId);
  }

  @Post("gyneco-history/enable")
  @ApiOperation({ summary: "Habilita manualmente el bloque gineco-obstétrico cuando corresponda" })
  async enableGyneco(@Param("patientId") patientId: string, @Req() req: ClinicalRequest) {
    await this.auditWrite(req, patientId, "records.gyneco.enable");
    return this.patientClinical.enableGynecoHistory(patientId, req.user.sub);
  }

  @Post("gyneco-history")
  async upsertGyneco(
    @Param("patientId") patientId: string,
    @Body(new ZodValidationPipe(gynecoHistoryUpsertSchema)) body: GynecoHistoryUpsertInput,
    @Req() req: ClinicalRequest
  ) {
    await this.auditWrite(req, patientId, "records.gyneco.upsert");
    return this.patientClinical.upsertGynecoHistory(patientId, req.user.sub, body);
  }

  // ── Fase 2 · Prompt 23B: heredados y plantillas ──────────────────

  @Post("history/:itemId/confirm-inherited")
  @ApiOperation({ summary: "Marca como revisado un antecedente heredado de plantilla" })
  async confirmInherited(
    @Param("patientId") patientId: string,
    @Param("itemId") itemId: string,
    @Req() req: ClinicalRequest
  ) {
    await this.auditWrite(req, patientId, "records.history.confirmInherited");
    return this.patientClinical.confirmInheritedHistoryItem(patientId, itemId, req.user.sub);
  }

  @Get("history-pending-inherited")
  @ApiOperation({ summary: "Antecedentes heredados sin revisar — bloquean la firma" })
  async pendingInherited(@Param("patientId") patientId: string, @Req() req: ClinicalRequest) {
    await this.auditRead(req, patientId, "records.history.pendingInherited");
    return this.patientClinical.pendingInheritedItems(patientId);
  }

  @Post("antecedentes-templates/:templateId/apply")
  @ApiOperation({ summary: "Aplica una plantilla — cada dato queda HEREDADO y la firma se bloquea hasta revisarlos" })
  async applyTemplate(
    @Param("patientId") patientId: string,
    @Param("templateId") templateId: string,
    @Req() req: ClinicalRequest
  ) {
    await this.auditWrite(req, patientId, "records.antecedentesTemplate.apply");
    return this.antecedentesTemplates.apply(templateId, patientId, req.user.sub);
  }

  // ── Fase 1 / #18: embarazo (Zona 1 de DOC-06) ────────────────────

  @Get("pregnancy")
  @ApiOperation({ summary: "Embarazo activo de la paciente, con SDG/FPP calculadas en servidor" })
  async getPregnancy(@Param("patientId") patientId: string, @Req() req: ClinicalRequest) {
    await this.auditRead(req, patientId, "records.pregnancy.read");
    return { pregnancy: await this.patientClinical.getActivePregnancy(patientId) };
  }

  @Post("pregnancy")
  @ApiOperation({ summary: "Registra un embarazo — FPP = FUM+280 salvo FPP por ultrasonido; un solo ACTIVE por paciente" })
  async createPregnancy(
    @Param("patientId") patientId: string,
    @Body(new ZodValidationPipe(patientPregnancyCreateSchema)) body: PatientPregnancyCreateInput,
    @Req() req: ClinicalRequest
  ) {
    await this.auditWrite(req, patientId, "records.pregnancy.create");
    return this.patientClinical.createPregnancy(patientId, req.user.sub, body);
  }

  @Patch("pregnancy/:pregnancyId")
  async updatePregnancy(
    @Param("patientId") patientId: string,
    @Param("pregnancyId") pregnancyId: string,
    @Body(new ZodValidationPipe(patientPregnancyUpdateSchema)) body: PatientPregnancyUpdateInput,
    @Req() req: ClinicalRequest
  ) {
    await this.auditWrite(req, patientId, "records.pregnancy.update");
    return this.patientClinical.updatePregnancy(patientId, pregnancyId, body);
  }

  @Post("pregnancy/:pregnancyId/close")
  @ApiOperation({ summary: "Cierra el embarazo activo — la fila nunca se borra; el desenlace se documenta en la nota" })
  async closePregnancy(
    @Param("patientId") patientId: string,
    @Param("pregnancyId") pregnancyId: string,
    @Req() req: ClinicalRequest
  ) {
    await this.auditWrite(req, patientId, "records.pregnancy.close");
    return this.patientClinical.closePregnancy(patientId, pregnancyId);
  }

  // ── Fase 1 / #19: diagnósticos vigentes (problemas activos) ──────

  @Get("active-diagnoses")
  @ApiOperation({ summary: "Vista derivada de los diagnósticos de consultas firmadas, deduplicados (Zona 1)" })
  async activeDiagnoses(@Param("patientId") patientId: string, @Req() req: ClinicalRequest) {
    await this.auditRead(req, patientId, "records.activeDiagnoses.read");
    return this.patientClinical.activeDiagnoses(patientId);
  }

  @Get("timeline")
  @ApiOperation({ summary: "§6.5.8: expediente cronológico — encuentros, recetas, órdenes" })
  async timeline(@Param("patientId") patientId: string, @Req() req: ClinicalRequest) {
    await this.auditRead(req, patientId, "records.timeline.read");
    return this.patientClinical.timeline(patientId);
  }

  // ── Fase 5 · Prompt 39A: hoja frontal del panel de consulta ──────

  @Get("hoja-frontal")
  @ApiOperation({ summary: "Prompt 39A: vista de una sola pantalla — id, domicilio, dx activos, alergias, medicación, última consulta, próxima cita" })
  async hojaFrontal(@Param("patientId") patientId: string, @Req() req: ClinicalRequest) {
    await this.auditRead(req, patientId, "records.hojaFrontal.read");
    return this.patientClinical.hojaFrontal(patientId, req.actingDoctorId as string);
  }

  // ── Fase 5 · Prompt 40: línea de tiempo de notas ──────────────────

  @Get("notes-timeline")
  @ApiOperation({ summary: "Prompt 40: notas firmadas con sus correcciones, filtrable por tipo/fecha/texto" })
  async notesTimeline(
    @Param("patientId") patientId: string,
    @Query("type") type: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("q") q: string | undefined,
    @Req() req: ClinicalRequest
  ) {
    await this.auditRead(req, patientId, "records.notesTimeline.read");
    const query: NotesTimelineQueryInput = notesTimelineQueryPipe.transform({ type, from, to, q });
    return this.patientClinical.notesTimeline(patientId, query);
  }

  // ── Fase 6 · Prompt 45: integridad y bitácora de acceso ──────────

  @Get("integrity-check")
  @ApiOperation({ summary: "Prompt 45: recalcula y verifica el sello de cada nota firmada del paciente contra lo guardado" })
  async integrityCheck(@Param("patientId") patientId: string, @Req() req: ClinicalRequest) {
    await this.auditRead(req, patientId, "records.integrityCheck.read");
    return this.noteIntegrity.verifyPatientChain(patientId);
  }

  @Get("access-log")
  @ApiOperation({ summary: "Prompt 45: bitácora de acceso del expediente — quién, cuándo, desde dónde, incluida la lectura del médico tratante" })
  async accessLog(@Param("patientId") patientId: string, @Req() req: ClinicalRequest) {
    await this.auditRead(req, patientId, "records.accessLog.read");
    return this.auditService.listForPatient(patientId);
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
