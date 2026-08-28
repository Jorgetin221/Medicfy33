import { Controller, Get, HttpStatus, Param, Req, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiException } from "../../common/api-exception";
import { JwtAuthGuard, type AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { AuditService } from "../identity/services/audit.service";
import { getRequestMeta } from "../identity/request-meta";
import { ClinicalAttachmentService } from "./services/clinical-attachment.service";
import { DocumentAccessService, type DocumentViewTokenPayload } from "./services/document-access.service";

// Fase 5 · Prompt 41: sirve los bytes de un documento clínico a partir
// de una URL firmada de vida corta — NUNCA por un enlace permanente.
// Sin CareRelationshipGuard aquí a propósito: el token ya prueba que
// el vínculo estaba activo en el momento de firmarlo (≤5 min antes) —
// re-resolverlo aquí sería redundante con lo que el token codifica.
// JwtAuthGuard se mantiene para que la sesión siga siendo de un
// médico autenticado y para atribuir el acceso en audit_log (R3/R6).
@ApiTags("records")
@ApiBearerAuth()
@Controller("documents")
@UseGuards(JwtAuthGuard)
export class DocumentViewController {
  constructor(
    private readonly attachments: ClinicalAttachmentService,
    private readonly documentAccess: DocumentAccessService,
    private readonly auditService: AuditService
  ) {}

  @Get("view/:token")
  @ApiOperation({ summary: "Prompt 41: bytes del documento — token vencido o de otro médico responde 401/403" })
  async view(@Param("token") token: string, @Req() req: AuthenticatedRequest): Promise<StreamableFile> {
    // R3: "toda lectura ... se registra ... sin excepción, incluidos
    // los accesos denegados" — un token vencido o de otra sesión es
    // exactamente ese caso, no solo el éxito.
    let payload: DocumentViewTokenPayload;
    try {
      payload = this.documentAccess.verifyViewToken(token);
    } catch (err) {
      await this.auditDenied(req, "token_invalid_or_expired");
      throw err;
    }
    if (payload.sub !== req.user.sub) {
      await this.auditDenied(req, "token_belongs_to_other_session", payload.documentId, payload.patientId);
      throw new ApiException("DOCUMENT_URL_EXPIRED", "El enlace del documento venció o no es válido — pide uno nuevo.", HttpStatus.FORBIDDEN);
    }

    const { attachment, buffer, contentType } = await this.attachments.getBytes(payload.documentId);

    const meta = getRequestMeta(req);
    await this.auditService.log({
      actorUserId: req.user.sub,
      actorRole: "DOCTOR",
      action: "records.documents.view",
      resourceType: "clinical_attachment",
      resourceId: attachment.id,
      patientId: attachment.patientId,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return new StreamableFile(buffer, { type: contentType });
  }

  private async auditDenied(req: AuthenticatedRequest, reason: string, resourceId?: string, patientId?: string): Promise<void> {
    const meta = getRequestMeta(req);
    await this.auditService.log({
      actorUserId: req.user.sub,
      actorRole: "DOCTOR",
      action: "records.documents.view",
      resourceType: "clinical_attachment",
      ...(resourceId !== undefined ? { resourceId } : {}),
      ...(patientId !== undefined ? { patientId } : {}),
      result: "DENIED",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { reason },
    });
  }
}
