import { BadRequestException, Controller, Get, HttpStatus, Param, Post, Query, Req, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { Express } from "express";
import { brandingAssetUploadMetadataSchema } from "@medicfy/contracts";
import { ApiException } from "../../common/api-exception";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { DoctorProfileService } from "./services/doctor-profile.service";
import { DoctorBrandingService, InvalidBrandingAssetError } from "./services/doctor-branding.service";

// Parte B §1.2/§5.1: logo y firma visual, con "vista previa
// inmediata" real — GET sirve los bytes (no solo metadata, a
// diferencia de doctors/me/documents).
@ApiTags("doctors")
@ApiBearerAuth()
@Controller("doctors/me/branding-assets")
@UseGuards(JwtAuthGuard)
export class BrandingAssetsController {
  constructor(
    private readonly doctorProfileService: DoctorProfileService,
    private readonly brandingService: DoctorBrandingService
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor("file"))
  @ApiConsumes("multipart/form-data")
  @ApiQuery({ name: "kind", enum: ["logo", "signature"] })
  @ApiOperation({ summary: "Sube el logo o la firma visual del médico (Parte B §1.2)" })
  async upload(@UploadedFile() file: Express.Multer.File | undefined, @Query() query: Record<string, unknown>, @Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    if (!file) {
      throw new ApiException("FILE_REQUIRED", "Debes adjuntar un archivo.", HttpStatus.BAD_REQUEST);
    }
    const meta = brandingAssetUploadMetadataSchema.safeParse(query);
    if (!meta.success) {
      throw new ApiException("VALIDATION_ERROR", "kind inválido.", HttpStatus.BAD_REQUEST, { issues: meta.error.issues });
    }

    const doctor = await this.doctorProfileService.getOwnProfile(user.sub);
    try {
      return await this.brandingService.upload({
        doctorId: doctor.id,
        kind: meta.data.kind,
        buffer: file.buffer,
        mimeType: file.mimetype,
      });
    } catch (error) {
      if (error instanceof InvalidBrandingAssetError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get(":kind")
  @ApiOperation({ summary: "Sirve el logo o la firma visual ya subidos" })
  async get(@Param("kind") kind: string, @Req() req: Request): Promise<StreamableFile> {
    if (kind !== "logo" && kind !== "signature") {
      throw new ApiException("VALIDATION_ERROR", "kind inválido.", HttpStatus.BAD_REQUEST);
    }
    const { user } = req as AuthenticatedRequest;
    const doctor = await this.doctorProfileService.getOwnProfile(user.sub);
    const asset = await this.brandingService.getAsset(doctor.id, kind);
    return new StreamableFile(asset.buffer, { type: asset.contentType });
  }
}
