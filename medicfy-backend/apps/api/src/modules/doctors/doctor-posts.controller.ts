import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
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
import type { Request } from "express";
import type { Express } from "express";
import { doctorPostCreateSchema, doctorPostMediaUploadMetadataSchema, doctorPostUpdateSchema } from "@medicfy/contracts";
import { ApiException } from "../../common/api-exception";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { DoctorProfileService } from "./services/doctor-profile.service";
import { DoctorPostService, InvalidPostMediaError } from "./services/doctor-post.service";

// M2B (spec §7, v2.2): panel privado del médico — administra sus
// propias publicaciones sin importar audiencia/estado (a diferencia
// de las rutas públicas/de pacientes, que filtran por ambas).
@ApiTags("doctor-posts")
@ApiBearerAuth()
@Controller("doctors/me/posts")
@UseGuards(JwtAuthGuard)
export class DoctorPostsController {
  constructor(
    private readonly doctorProfileService: DoctorProfileService,
    private readonly postService: DoctorPostService
  ) {}

  @Get()
  @ApiOperation({ summary: "M2B: mis publicaciones, cualquier audiencia/estado" })
  async list(@Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    const doctor = await this.doctorProfileService.getOwnProfile(user.sub);
    return this.postService.listOwn(doctor.id);
  }

  @Get(":id")
  @ApiOperation({ summary: "M2B: detalle de una publicación propia" })
  async get(@Param("id") id: string, @Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    const doctor = await this.doctorProfileService.getOwnProfile(user.sub);
    return this.postService.getOwn(doctor.id, id);
  }

  @Post()
  @ApiOperation({ summary: "M2B: crea una publicación (DRAFT por default vía visibility=PRIVATE)" })
  async create(@Body() rawBody: Record<string, unknown>, @Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    const result = doctorPostCreateSchema.safeParse(rawBody);
    if (!result.success) {
      throw new ApiException("VALIDATION_ERROR", "Datos de entrada inválidos.", HttpStatus.BAD_REQUEST, {
        issues: result.error.issues,
      });
    }
    const doctor = await this.doctorProfileService.getOwnProfile(user.sub);
    return this.postService.create(doctor, result.data);
  }

  @Patch(":id")
  @ApiOperation({ summary: "M2B: edita título/cuerpo/categoría/audiencia/estado de una publicación propia" })
  async update(@Param("id") id: string, @Body() rawBody: Record<string, unknown>, @Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    const result = doctorPostUpdateSchema.safeParse(rawBody);
    if (!result.success) {
      throw new ApiException("VALIDATION_ERROR", "Datos de entrada inválidos.", HttpStatus.BAD_REQUEST, {
        issues: result.error.issues,
      });
    }
    const doctor = await this.doctorProfileService.getOwnProfile(user.sub);
    return this.postService.update(doctor, id, result.data);
  }

  @Delete(":id")
  @ApiOperation({ summary: "M2B-RN-003: borra una publicación propia (no es dato clínico, DELETE real)" })
  async remove(@Param("id") id: string, @Req() req: Request): Promise<void> {
    const { user } = req as AuthenticatedRequest;
    const doctor = await this.doctorProfileService.getOwnProfile(user.sub);
    await this.postService.remove(doctor.id, id);
  }

  @Post(":id/media")
  @UseInterceptors(FileInterceptor("file"))
  @ApiConsumes("multipart/form-data")
  @ApiQuery({ name: "mediaType", enum: ["PHOTO", "VIDEO"] })
  @ApiOperation({ summary: "M2B-RN-005: sube una foto (video: PENDIENTE(jorge), ver spec §7 M2B) a una publicación propia" })
  async uploadMedia(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query() query: Record<string, unknown>,
    @Req() req: Request
  ) {
    const { user } = req as AuthenticatedRequest;
    if (!file) {
      throw new ApiException("FILE_REQUIRED", "Debes adjuntar un archivo.", HttpStatus.BAD_REQUEST);
    }
    const meta = doctorPostMediaUploadMetadataSchema.safeParse(query);
    if (!meta.success) {
      throw new ApiException("VALIDATION_ERROR", "mediaType inválido.", HttpStatus.BAD_REQUEST, {
        issues: meta.error.issues,
      });
    }
    const doctor = await this.doctorProfileService.getOwnProfile(user.sub);
    try {
      return await this.postService.uploadMedia({
        doctorId: doctor.id,
        postId: id,
        mediaType: meta.data.mediaType,
        buffer: file.buffer,
        mimeType: file.mimetype,
      });
    } catch (error) {
      if (error instanceof InvalidPostMediaError) {
        throw new ApiException("INVALID_POST_MEDIA", error.message, HttpStatus.BAD_REQUEST);
      }
      throw error;
    }
  }

  @Get(":id/media/:mediaId")
  @ApiOperation({ summary: "M2B: sirve los bytes de un medio propio, sin importar audiencia/estado" })
  async getMedia(@Param("id") id: string, @Param("mediaId") mediaId: string, @Req() req: Request): Promise<StreamableFile> {
    const { user } = req as AuthenticatedRequest;
    const doctor = await this.doctorProfileService.getOwnProfile(user.sub);
    const asset = await this.postService.getOwnMediaBytes(doctor.id, id, mediaId);
    return new StreamableFile(asset.buffer, { type: asset.contentType });
  }
}
