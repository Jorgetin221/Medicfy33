import { Controller, Get, Header, Param, StreamableFile } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { DoctorProfileService } from "./services/doctor-profile.service";
import { ServiceOfferingService } from "./services/service-offering.service";
import { DoctorPostService } from "./services/doctor-post.service";
import { DoctorPhotoService } from "./services/doctor-photo.service";
import { DownloadThrottle } from "../../common/rate-limit";

// M5-RN-007: "el enlace público del médico (/dr/{slug})" — sin guard,
// a propósito. toPublicDoctorView/toPublicServiceView (doctor-public-view.ts)
// son el único lugar que decide qué campos salen de aquí; nunca precio
// (M2-RN-003/M2-CA-001).
@ApiTags("doctors-public")
@Controller("doctors/:slug/public")
export class DoctorPublicController {
  constructor(
    private readonly doctorProfileService: DoctorProfileService,
    private readonly serviceOfferingService: ServiceOfferingService,
    private readonly postService: DoctorPostService,
    private readonly photoService: DoctorPhotoService
  ) {}

  @Get()
  @ApiOperation({ summary: "Perfil público del médico por slug (M5-RN-007) — sin precio, sin datos privados" })
  async getPublicProfile(@Param("slug") slug: string) {
    return this.doctorProfileService.getPublicViewBySlug(slug);
  }

  @Get("services")
  @ApiOperation({ summary: "Servicios activos del médico, sin precio — usado para elegir service_id antes de /doctors/:id/availability" })
  async getPublicServices(@Param("slug") slug: string) {
    return this.serviceOfferingService.listPublicBySlug(slug);
  }

  @Get("posts")
  @ApiOperation({ summary: "M2B-CA-002: solo publicaciones visibility=PUBLIC y status=PUBLISHED" })
  async getPublicPosts(@Param("slug") slug: string) {
    return this.postService.listPublicBySlug(slug);
  }

  @DownloadThrottle()
  @Get("posts/:postId/media/:mediaId")
  @ApiOperation({ summary: "M2B: sirve los bytes de un medio, solo si su publicación es PUBLIC y PUBLISHED" })
  async getPublicPostMedia(
    @Param("slug") slug: string,
    @Param("postId") postId: string,
    @Param("mediaId") mediaId: string
  ): Promise<StreamableFile> {
    const asset = await this.postService.getPublicMediaBytes(slug, postId, mediaId);
    return new StreamableFile(asset.buffer, { type: asset.contentType });
  }

  // Foto de perfil: pública por diseño (perfil público, directorio,
  // portada). Solo responde la foto VIGENTE; el nombre del archivo es
  // único por subida, así que se puede cachear sin riesgo de servir una
  // foto vieja.
  @Get("photo/:fileName")
  @Header("Cache-Control", "public, max-age=86400, immutable")
  @ApiOperation({ summary: "Sirve la foto de perfil vigente del médico" })
  async getPhoto(@Param("slug") slug: string, @Param("fileName") fileName: string): Promise<StreamableFile> {
    const photo = await this.photoService.getPublicPhoto(slug, fileName);
    return new StreamableFile(photo.buffer, { type: photo.contentType });
  }
}
