import {
  BadRequestException,
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { Express } from "express";
import { documentUploadMetadataSchema } from "@medicfy/contracts";
import { ApiException } from "../../common/api-exception";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { DoctorProfileService } from "./services/doctor-profile.service";
import { DoctorDocumentService, InvalidDocumentError } from "./services/doctor-document.service";

@ApiTags("doctors")
@ApiBearerAuth()
@Controller("doctors/me/documents")
@UseGuards(JwtAuthGuard)
export class DoctorDocumentsController {
  constructor(
    private readonly doctorProfileService: DoctorProfileService,
    private readonly documentService: DoctorDocumentService
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor("file"))
  @ApiConsumes("multipart/form-data")
  @ApiQuery({ name: "docType", enum: ["CEDULA_PROFESIONAL", "CEDULA_ESPECIALIDAD", "INE", "CV", "CERTIFICADO_CONSEJO", "COMPROBANTE_DOMICILIO"] })
  @ApiOperation({ summary: "Sube un documento del expediente de verificación (spec §7 M2 validaciones)" })
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query() query: Record<string, unknown>,
    @Req() req: Request
  ) {
    const { user } = req as AuthenticatedRequest;
    if (!file) {
      throw new ApiException("FILE_REQUIRED", "Debes adjuntar un archivo.", HttpStatus.BAD_REQUEST);
    }
    const meta = documentUploadMetadataSchema.safeParse(query);
    if (!meta.success) {
      throw new ApiException("VALIDATION_ERROR", "docType inválido.", HttpStatus.BAD_REQUEST, {
        issues: meta.error.issues,
      });
    }

    const doctor = await this.doctorProfileService.getOwnProfile(user.sub);
    try {
      return await this.documentService.upload({
        doctorId: doctor.id,
        docType: meta.data.docType,
        buffer: file.buffer,
        mimeType: file.mimetype,
      });
    } catch (error) {
      if (error instanceof InvalidDocumentError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get()
  @ApiOperation({ summary: "Lista los documentos subidos por el médico autenticado" })
  async list(@Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    const doctor = await this.doctorProfileService.getOwnProfile(user.sub);
    return this.documentService.listForDoctor(doctor.id);
  }
}
