import { Injectable, Logger, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, normalize, resolve, sep } from "node:path";
import type { FileStoragePort } from "./file-storage.port";

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
const PRODUCTION_DEFAULT_DIR = "/var/lib/medicfy/media";

export function resolvePublicMediaRoot(env: { PUBLIC_MEDIA_DIR?: string; NODE_ENV?: string } = process.env): string {
  if (env.PUBLIC_MEDIA_DIR) {
    if (!isAbsolute(env.PUBLIC_MEDIA_DIR)) {
      throw new Error("PUBLIC_MEDIA_DIR debe ser una ruta absoluta (p. ej. /var/lib/medicfy/media).");
    }
    return resolve(env.PUBLIC_MEDIA_DIR);
  }
  return env.NODE_ENV === "production" ? PRODUCTION_DEFAULT_DIR : resolve(process.cwd(), ".local-file-storage", "public-media");
}

/**
 * Disco del servidor (VPS) para medios PÚBLICOS: hoy solo la foto de
 * perfil del médico, que de todos modos se muestra a cualquiera en el
 * perfil público y el directorio. A diferencia de
 * LocalDiskFileStorageAdapter, este SÍ corre en producción — por eso
 * tiene su propio token (PUBLIC_MEDIA_STORAGE) y nunca se usa para
 * archivos clínicos ni documentos de identidad (spec §4.3: esos van
 * cifrados en S3/R2).
 *
 * Respaldos: la carpeta debe entrar en el respaldo del VPS — si el
 * disco se pierde, se pierden las fotos (el médico puede volver a
 * subirlas; no hay dato clínico en juego).
 */
@Injectable()
export class DiskPublicMediaStorageAdapter implements FileStoragePort, OnModuleInit {
  private readonly logger = new Logger(DiskPublicMediaStorageAdapter.name);
  private readonly root = resolvePublicMediaRoot();

  // Falla al ARRANCAR si la carpeta no se puede crear (permisos), en
  // vez de descubrirlo en la primera foto que suba un médico.
  async onModuleInit(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    this.logger.log(`Medios públicos en ${this.root}`);
  }

  private resolveSafePath(fileKey: string): string {
    const target = normalize(join(this.root, fileKey));
    if (!target.startsWith(this.root + sep)) {
      throw new Error("Ruta de archivo fuera de la carpeta de medios públicos.");
    }
    return target;
  }

  async store(params: { fileKey: string; buffer: Buffer; contentType: string }): Promise<void> {
    const target = this.resolveSafePath(params.fileKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, params.buffer);
  }

  async retrieve(fileKey: string): Promise<{ buffer: Buffer; contentType: string }> {
    const target = this.resolveSafePath(fileKey);
    const contentType = CONTENT_TYPE_BY_EXTENSION[extname(target)];
    if (!contentType) throw new NotFoundException("Archivo no encontrado.");
    try {
      return { buffer: await readFile(target), contentType };
    } catch {
      throw new NotFoundException("Archivo no encontrado.");
    }
  }

  async remove(fileKey: string): Promise<void> {
    await rm(this.resolveSafePath(fileKey), { force: true });
  }

  // Los medios públicos se sirven por su ruta pública; no hay URL
  // firmada que dar.
  async getSignedDownloadUrl(): Promise<string> {
    throw new Error("DiskPublicMediaStorageAdapter no emite URLs firmadas: los medios públicos se sirven por su ruta pública.");
  }
}
