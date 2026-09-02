import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import type { FileStoragePort } from "./file-storage.port";

// No hay columna de content-type en disco (ni sidecar): se infiere de
// la extensión que el llamador ya agrega al fileKey al guardar. Vive
// aquí porque es un detalle del adaptador de almacenamiento, no del
// dominio de negocio.
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};
const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

export function extensionForMimeType(mimeType: string): string {
  return EXTENSION_BY_MIME_TYPE[mimeType] ?? "";
}

// Dev-only stand-in until real S3/R2 credentials exist. Fails loudly
// in production rather than silently writing PHI-adjacent documents
// (INE, cédula) to local disk on a shared host.
@Injectable()
export class LocalDiskFileStorageAdapter implements FileStoragePort {
  private readonly logger = new Logger(LocalDiskFileStorageAdapter.name);
  private readonly root = resolve(process.cwd(), ".local-file-storage");

  private assertNotProduction(): void {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "LocalDiskFileStorageAdapter must not run in production — wire S3/R2 (spec §4.3) before deploying."
      );
    }
  }

  private resolveSafePath(fileKey: string): string {
    // fileKey is server-generated (see DoctorDocumentService), but
    // resolving defensively costs nothing and guards against a future
    // caller passing something attacker-influenced.
    const target = normalize(join(this.root, fileKey));
    if (!target.startsWith(this.root + sep)) {
      throw new Error(`Refusing to write outside storage root: ${fileKey}`);
    }
    return target;
  }

  async store(params: { fileKey: string; buffer: Buffer; contentType: string }): Promise<void> {
    this.assertNotProduction();
    const target = this.resolveSafePath(params.fileKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, params.buffer);
    this.logger.log(`[dev-only] stored ${params.fileKey} (${params.contentType}, ${params.buffer.length}B)`);
  }

  async getSignedDownloadUrl(fileKey: string, ttlSeconds: number): Promise<string> {
    this.assertNotProduction();
    // Sigue siendo metadata only para el flujo de revisión de
    // documentos (M2), que lee file_hash_sha256, no los bytes. Perfil
    // usa retrieve() en su lugar, más abajo.
    return `local-dev-storage://${fileKey}?ttl=${ttlSeconds}`;
  }

  async retrieve(fileKey: string): Promise<{ buffer: Buffer; contentType: string }> {
    this.assertNotProduction();
    const target = this.resolveSafePath(fileKey);
    let buffer: Buffer;
    try {
      buffer = await readFile(target);
    } catch {
      throw new NotFoundException("Archivo no encontrado.");
    }
    const contentType = MIME_TYPE_BY_EXTENSION[extname(target)] ?? "application/octet-stream";
    return { buffer, contentType };
  }
}
