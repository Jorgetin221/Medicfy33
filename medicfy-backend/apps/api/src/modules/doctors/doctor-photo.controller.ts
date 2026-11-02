import { Controller, Delete, HttpCode, HttpStatus, Post, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { ApiException } from "../../common/api-exception";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { getRequestMeta } from "../identity/request-meta";
import { AuditService } from "../identity/services/audit.service";
import { DoctorProfileService } from "./services/doctor-profile.service";
import { DoctorPhotoService, MAX_DOCTOR_PHOTO_BYTES } from "./services/doctor-photo.service";

// Foto de perfil del médico: subir y quitar (solo el propio médico).
// Servirla es público — ver DoctorPublicController GET photo/:fileName.
@ApiTags("doctors")
@ApiBearerAuth()
@Controller("doctors/me/photo")
@UseGuards(JwtAuthGuard)
export class DoctorPhotoController {
  constructor(
    private readonly doctorProfileService: DoctorProfileService,
    private readonly photoService: DoctorPhotoService,
    private readonly auditService: AuditService
  ) {}

  @Post()
  // M-07: el tope en multer evita cargar en memoria archivos enormes
  // antes de que el servicio los rechace.
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_DOCTOR_PHOTO_BYTES } }))
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Sube (o reemplaza) la foto de perfil del médico — JPG, PNG o WebP, máx. 5 MB" })
  @ApiResponse({ status: 201, description: "{ photoUrl }" })
  @ApiResponse({ status: 400, description: "FILE_REQUIRED | PHOTO_INVALID_FORMAT | PHOTO_TOO_LARGE | FILE_CONTENT_MISMATCH" })
  async upload(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    if (!file) {
      throw new ApiException("FILE_REQUIRED", "Debes adjuntar un archivo.", HttpStatus.BAD_REQUEST);
    }
    const doctor = await this.doctorProfileService.getOwnProfile(user.sub);
    const result = await this.photoService.upload({ doctorId: doctor.id, buffer: file.buffer, mimeType: file.mimetype });
    await this.audit(user.sub, doctor.id, "doctors.photo.upload", req);
    return result;
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Quita la foto de perfil del médico" })
  @ApiResponse({ status: 200 })
  async remove(@Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    const doctor = await this.doctorProfileService.getOwnProfile(user.sub);
    await this.photoService.remove(doctor.id);
    await this.audit(user.sub, doctor.id, "doctors.photo.remove", req);
    return { removed: true };
  }

  private audit(actorUserId: string, doctorId: string, action: string, req: Request): Promise<void> {
    const meta = getRequestMeta(req);
    return this.auditService.log({
      actorUserId,
      actorRole: "DOCTOR",
      action,
      resourceType: "doctor",
      resourceId: doctorId,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}
