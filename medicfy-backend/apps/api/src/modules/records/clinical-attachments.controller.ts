import { Controller, Get, HttpStatus, Param, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Express } from "express";
import { clinicalAttachmentUploadMetadataSchema } from "@medicfy/contracts";
import { ApiException } from "../../common/api-exception";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { CareRelationshipGuard, type ClinicalRequest } from "../../common/guards/care-relationship.guard";
import { AuditService } from "../identity/services/audit.service";
import { getRequestMeta } from "../identity/request-meta";
import { LAB_RESULT_MAX_FILE_BYTES, labResultFileFilter } from "../../common/upload-validation.util";
import { ClinicalAttachmentService } from "./services/clinical-attachment.service";
import { DocumentAccessService } from "./services/document-access.service";

// Fase 5 · Prompt 41: carga y listado de documentos del panel de
// consulta, más la emisión de la URL firmada que los sirve (el visor
// SIN DESCARGAR vive en GET /documents/view/:token,
// document-view.controller.ts — sin CareRelationshipGuard ahí porque
// el token de vida corta ES la autorización de ese endpoint).
@ApiTags("records")
@ApiBearerAuth()
@Controller("records/patients/:patientId")
@UseGuards(JwtAuthGuard, CareRelationshipGuard)
export class ClinicalAttachmentsController {
  constructor(
    private readonly attachments: ClinicalAttachmentService,
    private readonly documentAccess: DocumentAccessService,
    private readonly auditService: AuditService
  ) {}

  @Get("documents")
  @ApiOperation({ summary: "Prompt 41: documentos clínicos del paciente (estudios, imágenes, externos)" })
  async list(@Param("patientId") patientId: string, @Req() req: ClinicalRequest) {
    await this.audit(req, patientId, "records.documents.list");
    return this.attachments.listForPatient(patientId);
  }

  @Post("documents")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: LAB_RESULT_MAX_FILE_BYTES }, fileFilter: labResultFileFilter }))
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Prompt 41: sube un documento — categoría, fecha del estudio y descripción por query" })
  async upload(
    @Param("patientId") patientId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query() query: Record<string, unknown>,
    @Req() req: ClinicalRequest
  ) {
    if (!file) {
      throw new ApiException("FILE_REQUIRED", "Debes adjuntar un archivo.", HttpStatus.BAD_REQUEST);
    }
    const meta = clinicalAttachmentUploadMetadataSchema.safeParse(query);
    if (!meta.success) {
      throw new ApiException("VALIDATION_ERROR", "Metadatos inválidos.", HttpStatus.BAD_REQUEST, { issues: meta.error.issues });
    }

    const attachment = await this.attachments.upload(patientId, req.user.sub, file, meta.data);
    await this.audit(req, patientId, "records.documents.upload", attachment.id);
    return attachment;
  }

  @Get("documents/:documentId/signed-url")
  @ApiOperation({ summary: "Prompt 41: URL firmada de vida corta (≤5 min) para ver el documento sin descargarlo" })
  async signedUrl(
    @Param("patientId") patientId: string,
    @Param("documentId") documentId: string,
    @Req() req: ClinicalRequest
  ) {
    const attachment = await this.attachments.getForPatient(documentId, patientId);
    // El token codifica req.user.sub (userId), no actingDoctorId: es lo
    // único que DocumentViewController puede comparar sin repetir
    // CareRelationshipGuard ahí (JwtAuthGuard solo resuelve req.user).
    const { token, expiresAt } = this.documentAccess.signViewToken(attachment.id, patientId, req.user.sub);
    await this.audit(req, patientId, "records.documents.signedUrl", documentId);
    return { url: `/documents/view/${token}`, expiresAt };
  }

  private async audit(req: ClinicalRequest, patientId: string, action: string, resourceId?: string) {
    const meta = getRequestMeta(req);
    await this.auditService.log({
      actorUserId: req.user.sub,
      actorRole: "DOCTOR",
      action,
      resourceType: "clinical_attachment",
      ...(resourceId !== undefined ? { resourceId } : {}),
      patientId,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}
