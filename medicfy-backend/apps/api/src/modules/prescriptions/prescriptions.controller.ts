import { Body, Controller, Get, Post, Req, StreamableFile, UseGuards, Param } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  prescriptionCreateSchema,
  prescriptionCancelSchema,
  externalPhysicalPrescriptionCreateSchema,
  type PrescriptionCreateInput,
  type PrescriptionCancelInput,
  type ExternalPhysicalPrescriptionCreateInput,
} from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { CareRelationshipGuard, type ClinicalRequest } from "../../common/guards/care-relationship.guard";
import { AuditService } from "../identity/services/audit.service";
import { getRequestMeta } from "../identity/request-meta";
import { PrescriptionService } from "./services/prescription.service";

// M9 — RECETA ELECTRÓNICA. Todas las rutas pasan por
// CareRelationshipGuard (resuelto vía encounterId/prescriptionId).
@ApiTags("prescriptions")
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, CareRelationshipGuard)
export class PrescriptionsController {
  constructor(
    private readonly prescriptions: PrescriptionService,
    private readonly auditService: AuditService
  ) {}

  @Post("prescriptions/encounters/:encounterId")
  @ApiOperation({ summary: "M9-RN-001/002: emite receta ligada al encuentro; M9-CA-007 firma con contraseña+TOTP" })
  async create(
    @Param("encounterId") encounterId: string,
    @Body(new ZodValidationPipe(prescriptionCreateSchema)) body: PrescriptionCreateInput,
    @Req() req: ClinicalRequest
  ) {
    const result = await this.prescriptions.create(
      encounterId,
      req.actingDoctorId as string,
      req.user.sub,
      req.clinicalPatientId as string,
      body
    );
    await this.audit(req, "prescriptions.create", result.prescription.id);
    return result;
  }

  @Post("prescriptions/encounters/:encounterId/external-physical")
  @ApiOperation({ summary: "M9-RN-014: registra receta ya emitida en recetario físico (Grupos I/II)" })
  async createExternalPhysical(
    @Param("encounterId") encounterId: string,
    @Body(new ZodValidationPipe(externalPhysicalPrescriptionCreateSchema)) body: ExternalPhysicalPrescriptionCreateInput,
    @Req() req: ClinicalRequest
  ) {
    const prescription = await this.prescriptions.createExternalPhysical(
      encounterId,
      req.actingDoctorId as string,
      req.clinicalPatientId as string,
      body
    );
    await this.audit(req, "prescriptions.external_physical.create", prescription.id);
    return prescription;
  }

  @Post("prescriptions/:prescriptionId/cancel")
  @ApiOperation({ summary: "M9-RN-006: cancelar — nunca UPDATE, inserta PrescriptionCancellation" })
  async cancel(
    @Param("prescriptionId") prescriptionId: string,
    @Body(new ZodValidationPipe(prescriptionCancelSchema)) body: PrescriptionCancelInput,
    @Req() req: ClinicalRequest
  ) {
    const cancellation = await this.prescriptions.cancel(prescriptionId, req.user.sub, body.reason);
    await this.audit(req, "prescriptions.cancel", prescriptionId);
    return cancellation;
  }

  // Corrección v2.1 §1/§17: antes de esta corrección no existía
  // ningún PDF que descargar — la única salida era el JSON de
  // /verificar/:token, que a propósito nunca trae contenido clínico.
  @Get("prescriptions/:prescriptionId/pdf")
  @ApiOperation({ summary: "Descarga el PDF de la receta (ambas rutas de firma)" })
  async pdf(@Param("prescriptionId") prescriptionId: string, @Req() req: ClinicalRequest): Promise<StreamableFile> {
    const { buffer, contentType } = await this.prescriptions.getPdf(prescriptionId);
    await this.audit(req, "prescriptions.pdf.download", prescriptionId);
    return new StreamableFile(buffer, { type: contentType });
  }

  // Corrección v2.1 §17.4/§25: declaración manual del médico, no una
  // verificación criptográfica — ver el comentario en
  // PrescriptionService.confirmHandwrittenDelivery().
  @Post("prescriptions/:prescriptionId/confirm-handwritten-delivery")
  @ApiOperation({ summary: "Marca 'firmada y entregada' — solo ruta HANDWRITTEN_AFTER_PRINT" })
  async confirmHandwrittenDelivery(@Param("prescriptionId") prescriptionId: string, @Req() req: ClinicalRequest) {
    const confirmation = await this.prescriptions.confirmHandwrittenDelivery(prescriptionId, req.user.sub);
    await this.audit(req, "prescriptions.confirm_handwritten_delivery", prescriptionId);
    return confirmation;
  }

  private async audit(req: ClinicalRequest, action: string, resourceId: string) {
    const meta = getRequestMeta(req);
    await this.auditService.log({
      actorUserId: req.user.sub,
      actorRole: "DOCTOR",
      action,
      resourceType: "prescription",
      resourceId,
      patientId: req.clinicalPatientId as string,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}
