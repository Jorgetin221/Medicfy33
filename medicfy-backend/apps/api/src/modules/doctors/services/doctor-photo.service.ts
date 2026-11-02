import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { assertContentMatchesDeclaredType } from "../../../common/file-signature.util";
import { PUBLIC_MEDIA_STORAGE, type FileStoragePort } from "./file-storage.port";
import { extensionForMimeType } from "./local-disk-file-storage.adapter";

export const MAX_DOCTOR_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// Nombre que el propio servidor genera: UUID + extensión conocida. El
// endpoint público solo acepta esta forma — nunca una ruta arbitraria.
const PHOTO_FILE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
const PUBLIC_PHOTO_SEGMENT = "/public/photo/";

/**
 * Foto de perfil del médico, SUBIDA (antes solo se podía pegar una URL
 * externa en photoUrl). A diferencia de logo/firma (DoctorBrandingService),
 * la foto es PÚBLICA: sale en /dr/{slug}, en el directorio y en la
 * portada — por eso se sirve sin sesión, y photoUrl guarda la URL
 * pública completa. Así toda pantalla que ya mostraba photoUrl sigue
 * funcionando sin cambios y sin migración.
 *
 * Se guarda en PUBLIC_MEDIA_STORAGE (disco del servidor, permitido en
 * producción) — no en FILE_STORAGE_PORT, que es para archivos clínicos.
 *
 * Solo se sirve la foto VIGENTE: al reemplazarla o quitarla, la
 * anterior deja de responder (y se borra del almacenamiento).
 */
@Injectable()
export class DoctorPhotoService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUBLIC_MEDIA_STORAGE) private readonly fileStorage: FileStoragePort
  ) {}

  async upload(params: { doctorId: string; buffer: Buffer; mimeType: string }): Promise<{ photoUrl: string }> {
    if (!ALLOWED_MIME_TYPES.has(params.mimeType)) {
      throw new ApiException("PHOTO_INVALID_FORMAT", "Formato no permitido. Usa JPG, PNG o WebP.", HttpStatus.BAD_REQUEST);
    }
    if (params.buffer.length > MAX_DOCTOR_PHOTO_BYTES) {
      throw new ApiException("PHOTO_TOO_LARGE", "La foto supera los 5 MB permitidos.", HttpStatus.BAD_REQUEST);
    }
    // El contenido real tiene que ser la imagen declarada (no un
    // ejecutable renombrado a .jpg) — mismo chequeo que logo/firma.
    assertContentMatchesDeclaredType(params.buffer, params.mimeType);

    const doctor = await this.prisma.doctor.findUniqueOrThrow({ where: { id: params.doctorId } });
    const fileName = `${randomUUID()}${extensionForMimeType(params.mimeType)}`;
    await this.fileStorage.store({ fileKey: photoFileKey(doctor.id, fileName), buffer: params.buffer, contentType: params.mimeType });

    const photoUrl = `${apiBaseUrl()}/doctors/${doctor.slug}${PUBLIC_PHOTO_SEGMENT}${fileName}`;
    await this.prisma.doctor.update({ where: { id: doctor.id }, data: { photoUrl } });
    await this.removeStoredPhoto(doctor.id, doctor.photoUrl);
    return { photoUrl };
  }

  async remove(doctorId: string): Promise<void> {
    const doctor = await this.prisma.doctor.findUniqueOrThrow({ where: { id: doctorId } });
    await this.prisma.doctor.update({ where: { id: doctor.id }, data: { photoUrl: null } });
    await this.removeStoredPhoto(doctor.id, doctor.photoUrl);
  }

  // Público, sin sesión: la foto ya es pública por diseño. Un nombre
  // mal formado, un médico inexistente o una foto que ya no es la
  // vigente responden igual (404).
  async getPublicPhoto(slug: string, fileName: string): Promise<{ buffer: Buffer; contentType: string }> {
    const notFound = () => new ApiException("PHOTO_NOT_FOUND", "Foto no encontrada.", HttpStatus.NOT_FOUND);
    if (!PHOTO_FILE_NAME.test(fileName)) throw notFound();
    const doctor = await this.prisma.doctor.findUnique({ where: { slug } });
    if (!doctor || storedPhotoFileName(doctor.photoUrl) !== fileName) throw notFound();
    return this.fileStorage.retrieve(photoFileKey(doctor.id, fileName));
  }

  // Solo borra archivos que este servicio subió; una URL externa
  // pegada a mano (el mecanismo anterior) no se toca.
  private async removeStoredPhoto(doctorId: string, previousPhotoUrl: string | null): Promise<void> {
    const previous = storedPhotoFileName(previousPhotoUrl);
    if (previous) await this.fileStorage.remove(photoFileKey(doctorId, previous));
  }
}

function photoFileKey(doctorId: string, fileName: string): string {
  return `doctor-photos/${doctorId}/${fileName}`;
}

export function storedPhotoFileName(photoUrl: string | null): string | null {
  if (!photoUrl?.startsWith(apiBaseUrl())) return null;
  const index = photoUrl.lastIndexOf(PUBLIC_PHOTO_SEGMENT);
  if (index < 0) return null;
  const fileName = photoUrl.slice(index + PUBLIC_PHOTO_SEGMENT.length);
  return PHOTO_FILE_NAME.test(fileName) ? fileName : null;
}

// URL pública de esta API: PUBLIC_API_URL si está, si no APP_BASE_URL
// (env.schema.ts). En el VPS debe ser https://api.medicfy.com.mx.
function apiBaseUrl(): string {
  return (process.env.PUBLIC_API_URL ?? process.env.APP_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
}
