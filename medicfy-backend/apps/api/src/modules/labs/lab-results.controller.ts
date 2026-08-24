import { Body, Controller, HttpStatus, Inject, Param, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { Express } from "express";
import { createHash } from "node:crypto";
import { labResultUploadMetadataSchema, labResultReviewSchema, type LabResultReviewInput } from "@medicfy/contracts";
import { ApiException } from "../../common/api-exception";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { CareRelationshipGuard, type ClinicalRequest } from "../../common/guards/care-relationship.guard";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { FILE_STORAGE_PORT, type FileStoragePort } from "../doctors/services/file-storage.port";
import { LabOrderService } from "./services/lab-order.service";

// §6.7: "v1.0: sube el médico o el paciente" — este controller cubre
// la subida como médico (con vínculo activo verificado por el
// guard); la subida como paciente es una superficie distinta
// (autenticación de paciente, fuera de alcance de este pase — ver el
// plan aprobado, que solo cubre el portal del médico).
@ApiTags("labs")
@ApiBearerAuth()
@Controller("lab-results/patients/:patientId")
@UseGuards(JwtAuthGuard, CareRelationshipGuard)
export class LabResultsController {
  constructor(
    private readonly labOrders: LabOrderService,
    @Inject(FILE_STORAGE_PORT) private readonly fileStorage: FileStoragePort
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor("file"))
  @ApiConsumes("multipart/form-data")
  @ApiQuery({ name: "labOrderId", required: false })
  @ApiOperation({ summary: "Sube un resultado de laboratorio (§6.7)" })
  async upload(
    @Param("patientId") patientId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query() query: Record<string, unknown>,
    @Req() req: ClinicalRequest
  ) {
    if (!file) {
      throw new ApiException("FILE_REQUIRED", "Debes adjuntar un archivo.", HttpStatus.BAD_REQUEST);
    }
    const meta = labResultUploadMetadataSchema.safeParse(query);
    if (!meta.success) {
      throw new ApiException("VALIDATION_ERROR", "Metadatos inválidos.", HttpStatus.BAD_REQUEST, { issues: meta.error.issues });
    }

    const fileHashSha256 = createHash("sha256").update(file.buffer).digest("hex");
    const fileKey = `lab-results/${patientId}/${Date.now()}-${fileHashSha256.slice(0, 12)}`;
    await this.fileStorage.store({ fileKey, buffer: file.buffer, contentType: file.mimetype });

    return this.labOrders.uploadResult(patientId, req.user.sub, "DOCTOR", fileKey, fileHashSha256, meta.data);
  }

  @Post(":resultId/review")
  @ApiOperation({ summary: "El médico revisa un resultado subido (por él o por el paciente)" })
  async review(
    @Param("resultId") resultId: string,
    @Body(new ZodValidationPipe(labResultReviewSchema)) body: LabResultReviewInput,
    @Req() req: ClinicalRequest
  ) {
    return this.labOrders.reviewResult(resultId, req.actingDoctorId as string, body.doctorComment);
  }
}
