import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { Express } from "express";
import { createHash } from "node:crypto";
import { labResultUploadMetadataSchema, labResultReviewSchema, type LabResultReviewInput } from "@medicfy/contracts";
import { ApiException } from "../../common/api-exception";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { CareRelationshipGuard, type ClinicalRequest } from "../../common/guards/care-relationship.guard";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { AuditService } from "../identity/services/audit.service";
import { getRequestMeta } from "../identity/request-meta";
import { FILE_STORAGE_PORT, type FileStoragePort } from "../doctors/services/file-storage.port";
import { extensionForMimeType } from "../doctors/services/local-disk-file-storage.adapter";
import { LabOrderService } from "./services/lab-order.service";
import { LAB_RESULT_MAX_FILE_BYTES, labResultFileFilter } from "../../common/upload-validation.util";

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
    private readonly auditService: AuditService,
    @Inject(FILE_STORAGE_PORT) private readonly fileStorage: FileStoragePort
  ) {}

  @Get()
  @ApiOperation({ summary: "Lista los resultados subidos de este paciente" })
  async list(@Param("patientId") patientId: string, @Req() req: ClinicalRequest) {
    await this.audit(req, patientId, "lab_results.list");
    return this.labOrders.listResultsForPatient(patientId);
  }

  @Get(":resultId/file")
  @ApiOperation({ summary: "Descarga los bytes de un resultado ya subido — no existía ninguna ruta para esto" })
  async file(
    @Param("patientId") patientId: string,
    @Param("resultId") resultId: string,
    @Req() req: ClinicalRequest
  ): Promise<StreamableFile> {
    const { buffer, contentType } = await this.labOrders.getResultFile(resultId, patientId);
    await this.audit(req, patientId, "lab_results.file.download", resultId);
    return new StreamableFile(buffer, { type: contentType });
  }

  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: LAB_RESULT_MAX_FILE_BYTES }, fileFilter: labResultFileFilter }))
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
    // El adaptador de almacenamiento (LocalDiskFileStorageAdapter) no
    // guarda el content-type en ningún lado — lo infiere de la
    // extensión del fileKey al leerlo (retrieve()). Sin extensión aquí,
    // todo volvía como application/octet-stream y el navegador forzaba
    // la descarga en vez de mostrarlo inline. Mismo patrón que ya usa
    // doctor-branding.service.ts.
    const fileKey = `lab-results/${patientId}/${Date.now()}-${fileHashSha256.slice(0, 12)}${extensionForMimeType(file.mimetype)}`;
    await this.fileStorage.store({ fileKey, buffer: file.buffer, contentType: file.mimetype });

    const result = await this.labOrders.uploadResult(patientId, req.user.sub, "DOCTOR", fileKey, fileHashSha256, meta.data);
    await this.audit(req, patientId, "lab_results.upload", result.id);
    return result;
  }

  @Post(":resultId/review")
  @ApiOperation({ summary: "El médico revisa un resultado subido (por él o por el paciente)" })
  async review(
    @Param("patientId") patientId: string,
    @Param("resultId") resultId: string,
    @Body(new ZodValidationPipe(labResultReviewSchema)) body: LabResultReviewInput,
    @Req() req: ClinicalRequest
  ) {
    // patientId viaja al servicio para que compare contra
    // result.patientId — el guard valida el paciente de la RUTA, no el
    // dueño del resultado (hallazgo #4 del Bloque 0).
    const result = await this.labOrders.reviewResult(resultId, patientId, req.actingDoctorId as string, body.doctorComment);
    await this.audit(req, patientId, "lab_results.review", resultId);
    return result;
  }

  private async audit(req: ClinicalRequest, patientId: string, action: string, resourceId?: string) {
    const meta = getRequestMeta(req);
    await this.auditService.log({
      actorUserId: req.user.sub,
      actorRole: "DOCTOR",
      action,
      resourceType: "lab_result",
      ...(resourceId !== undefined ? { resourceId } : {}),
      patientId,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}
