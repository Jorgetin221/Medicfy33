import { Body, Controller, Get, HttpStatus, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Express } from "express";
import { labSheetExtractionReviewSchema, type LabSheetExtractionReviewInput } from "@medicfy/contracts";
import { ApiException } from "../../common/api-exception";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { CareRelationshipGuard, type ClinicalRequest } from "../../common/guards/care-relationship.guard";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { AuditService } from "../identity/services/audit.service";
import { getRequestMeta } from "../identity/request-meta";
import { LAB_RESULT_MAX_FILE_BYTES, labResultFileFilter } from "../../common/upload-validation.util";
import { LabSheetExtractionService } from "./services/lab-sheet-extraction.service";

// Visión + una hoja con muchos analitos puede tardar más que el
// resumen objetivo (30s) pero no tanto como una lectura clínica
// completa (180s) — mismo patrón de AbortSignal.any que
// AssistantPassOrchestratorService, aquí en el controller porque este
// módulo no tiene una capa de orquestador aparte.
const DEFAULT_LAB_OCR_TIMEOUT_MS = 90_000;

function buildOcrSignal(req: ClinicalRequest): AbortSignal {
  const callerController = new AbortController();
  req.on("close", () => callerController.abort());
  const timeoutMs = Number(process.env.ASSISTANT_LAB_OCR_TIMEOUT_MS ?? DEFAULT_LAB_OCR_TIMEOUT_MS);
  return AbortSignal.any([callerController.signal, AbortSignal.timeout(timeoutMs)]);
}

// Capa 1 (v2.5) — mismo patrón de guardias/auditoría/multipart que
// lab-results.controller.ts. metadata de bitácora nunca lleva texto
// clínico (R2): solo conteos y el bucket de confianza más bajo entre
// las candidatas de cada extracción.
@ApiTags("labs")
@ApiBearerAuth()
@Controller("lab-sheet-extractions/patients/:patientId")
@UseGuards(JwtAuthGuard, CareRelationshipGuard)
export class LabSheetExtractionController {
  constructor(
    private readonly extractions: LabSheetExtractionService,
    private readonly auditService: AuditService
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: LAB_RESULT_MAX_FILE_BYTES }, fileFilter: labResultFileFilter }))
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Sube una hoja de laboratorio y dispara la lectura automática (Capa 1)" })
  async upload(
    @Param("patientId") patientId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: ClinicalRequest
  ) {
    if (!file) {
      throw new ApiException("FILE_REQUIRED", "Debes adjuntar un archivo.", HttpStatus.BAD_REQUEST);
    }
    const extraction = await this.extractions.upload(patientId, req.user.sub, file, buildOcrSignal(req));
    await this.audit(req, patientId, `lab_sheet.upload.${extraction.status.toLowerCase()}`, extraction.id, {
      candidateCount: extraction.candidates.length,
      lowestConfidence: lowestConfidence(extraction.candidates),
    });
    return extraction;
  }

  @Get(":extractionId")
  @ApiOperation({ summary: "Lee el estado y las candidatas de una extracción" })
  async get(@Param("patientId") patientId: string, @Param("extractionId") extractionId: string, @Req() req: ClinicalRequest) {
    const extraction = await this.extractions.get(extractionId, patientId);
    await this.audit(req, patientId, "lab_sheet.extraction.read", extractionId);
    return extraction;
  }

  @Post(":extractionId/retry")
  @ApiOperation({ summary: "Reintenta la lectura automática sobre el mismo archivo ya subido" })
  async retry(@Param("patientId") patientId: string, @Param("extractionId") extractionId: string, @Req() req: ClinicalRequest) {
    const extraction = await this.extractions.retry(extractionId, patientId, buildOcrSignal(req));
    await this.audit(req, patientId, `lab_sheet.ocr_extract.${extraction.status.toLowerCase()}`, extractionId, {
      candidateCount: extraction.candidates.length,
      lowestConfidence: lowestConfidence(extraction.candidates),
    });
    return extraction;
  }

  @Post(":extractionId/review")
  @ApiOperation({ summary: "El médico confirma/corrige las candidatas — la regla de oro vive en el servicio" })
  async review(
    @Param("patientId") patientId: string,
    @Param("extractionId") extractionId: string,
    @Body(new ZodValidationPipe(labSheetExtractionReviewSchema)) body: LabSheetExtractionReviewInput,
    @Req() req: ClinicalRequest
  ) {
    const result = await this.extractions.submitReview(extractionId, patientId, req.user.sub, body);
    await this.audit(req, patientId, "lab_sheet.review.accept", extractionId, {
      createdCount: result.created,
      editedCount: result.edited,
    });
    return result;
  }

  private async audit(req: ClinicalRequest, patientId: string, action: string, resourceId: string, metadata?: Record<string, unknown>) {
    const meta = getRequestMeta(req);
    await this.auditService.log({
      actorUserId: req.user.sub,
      actorRole: "DOCTOR",
      action,
      resourceType: "lab_sheet_extraction",
      resourceId,
      patientId,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      ...(metadata ? { metadata } : {}),
    });
  }
}

function lowestConfidence(candidates: { confidence: string }[]): string | null {
  if (candidates.length === 0) return null;
  const order = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  return candidates.reduce((lowest, c) => (order[c.confidence as keyof typeof order] < order[lowest as keyof typeof order] ? c.confidence : lowest), candidates[0]!.confidence);
}
