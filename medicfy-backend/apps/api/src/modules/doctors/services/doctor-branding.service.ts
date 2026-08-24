import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { FILE_STORAGE_PORT, type FileStoragePort } from "./file-storage.port";
import { extensionForMimeType } from "./local-disk-file-storage.adapter";

// Parte B §1.2/§5.1: logo y firma visual son assets de presentación
// del perfil — a diferencia de DoctorDocument, no llevan flujo de
// revisión admin, así que no reutilizan ese modelo. Mismo
// FileStoragePort que DoctorDocumentService, validaciones más
// estrictas por ser solo imágenes.
const MAX_BRANDING_ASSET_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg"]);

export type BrandingAssetKind = "logo" | "signature";

export class InvalidBrandingAssetError extends Error {}

@Injectable()
export class DoctorBrandingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE_PORT) private readonly fileStorage: FileStoragePort
  ) {}

  async upload(params: { doctorId: string; kind: BrandingAssetKind; buffer: Buffer; mimeType: string }): Promise<{ fileKey: string }> {
    if (!ALLOWED_MIME_TYPES.has(params.mimeType)) {
      throw new InvalidBrandingAssetError("Formato no permitido. Usa JPG o PNG.");
    }
    if (params.buffer.length > MAX_BRANDING_ASSET_BYTES) {
      throw new InvalidBrandingAssetError("La imagen supera los 5 MB permitidos.");
    }

    const fileKey = `doctor-branding/${params.doctorId}/${params.kind}-${randomUUID()}${extensionForMimeType(params.mimeType)}`;
    await this.fileStorage.store({ fileKey, buffer: params.buffer, contentType: params.mimeType });

    await this.prisma.doctor.update({
      where: { id: params.doctorId },
      data: params.kind === "logo" ? { logoUrl: fileKey } : { signatureImageUrl: fileKey },
    });

    return { fileKey };
  }

  async getAsset(doctorId: string, kind: BrandingAssetKind): Promise<{ buffer: Buffer; contentType: string }> {
    const doctor = await this.prisma.doctor.findUniqueOrThrow({ where: { id: doctorId } });
    const fileKey = kind === "logo" ? doctor.logoUrl : doctor.signatureImageUrl;
    if (!fileKey) {
      throw new ApiException("BRANDING_ASSET_NOT_FOUND", "Todavía no has subido este archivo.", HttpStatus.NOT_FOUND);
    }
    return this.fileStorage.retrieve(fileKey);
  }
}
