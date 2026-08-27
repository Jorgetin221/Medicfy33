import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type { DoctorDocument, DoctorDocumentType } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { FILE_STORAGE_PORT, type FileStoragePort } from "./file-storage.port";
import { extensionForMimeType } from "./local-disk-file-storage.adapter";

// spec M2 validaciones: "Documentos: PDF/JPG/PNG, ≤10 MB, hash SHA-256
// almacenado."
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

export class InvalidDocumentError extends Error {}

@Injectable()
export class DoctorDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE_PORT) private readonly fileStorage: FileStoragePort
  ) {}

  async upload(params: {
    doctorId: string;
    docType: DoctorDocumentType;
    buffer: Buffer;
    mimeType: string;
  }): Promise<DoctorDocument> {
    if (!ALLOWED_MIME_TYPES.has(params.mimeType)) {
      throw new InvalidDocumentError("Formato no permitido. Usa PDF, JPG o PNG.");
    }
    if (params.buffer.length > MAX_DOCUMENT_BYTES) {
      throw new InvalidDocumentError("El archivo supera los 10 MB permitidos.");
    }

    const fileHashSha256 = createHash("sha256").update(params.buffer).digest("hex");
    // Sin extensión, retrieve() no puede inferir el content-type y cae
    // a application/octet-stream (mismo hallazgo que lab-results —
    // ver lab-results.controller.ts).
    const fileKey = `doctor-documents/${params.doctorId}/${randomUUID()}${extensionForMimeType(params.mimeType)}`;
    await this.fileStorage.store({ fileKey, buffer: params.buffer, contentType: params.mimeType });

    return this.prisma.doctorDocument.create({
      data: {
        doctorId: params.doctorId,
        docType: params.docType,
        fileKey,
        fileHashSha256,
        reviewStatus: "PENDING",
      },
    });
  }

  async listForDoctor(doctorId: string): Promise<DoctorDocument[]> {
    return this.prisma.doctorDocument.findMany({
      where: { doctorId },
      orderBy: { uploadedAt: "desc" },
    });
  }
}
