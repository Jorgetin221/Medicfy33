import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type { Express } from "express";
import type { ClinicalAttachment } from "@prisma/client";
import type { ClinicalAttachmentUploadMetadataInput } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { FILE_STORAGE_PORT, type FileStoragePort } from "../../doctors/services/file-storage.port";
import { extensionForMimeType } from "../../doctors/services/local-disk-file-storage.adapter";

// Fase 5 · Prompt 41: "Documentos con acceso controlado". El modelo
// ClinicalAttachment (schema.prisma, comentario M8-RN-010) ya existía
// completo pero sin ningún controller/service que lo usara — esto lo
// conecta, reusando el mismo patrón de fileKey+hash que
// doctor-document.service.ts y lab-results.controller.ts.
@Injectable()
export class ClinicalAttachmentService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE_PORT) private readonly fileStorage: FileStoragePort
  ) {}

  async listForPatient(patientId: string): Promise<ClinicalAttachment[]> {
    return this.prisma.clinicalAttachment.findMany({
      where: { patientId },
      orderBy: { uploadedAt: "desc" },
    });
  }

  async upload(
    patientId: string,
    uploadedByUserId: string,
    file: Express.Multer.File,
    meta: ClinicalAttachmentUploadMetadataInput
  ): Promise<ClinicalAttachment> {
    const fileHashSha256 = createHash("sha256").update(file.buffer).digest("hex");
    // Sin extensión en el fileKey, retrieve() no puede inferir el
    // content-type y el visor embebido recibe application/octet-stream
    // (mismo hallazgo que lab-results y doctor-document).
    const fileKey = `clinical-attachments/${patientId}/${randomUUID()}${extensionForMimeType(file.mimetype)}`;
    await this.fileStorage.store({ fileKey, buffer: file.buffer, contentType: file.mimetype });

    return this.prisma.clinicalAttachment.create({
      data: {
        patientId,
        encounterId: meta.encounterId ?? null,
        fileKey,
        fileName: file.originalname,
        fileHashSha256,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        category: meta.category,
        studyDate: meta.studyDate ? new Date(meta.studyDate) : null,
        uploadedByUserId,
        description: meta.description ?? null,
      },
    });
  }

  // El endpoint de URL firmada valida que el documento pertenezca al
  // paciente de la RUTA (ya autorizada por CareRelationshipGuard) antes
  // de firmar ningún token — mismo hallazgo del Bloque 0 que ya obligó
  // a lab-results.controller.ts a comparar contra patientId.
  async getForPatient(documentId: string, patientId: string): Promise<ClinicalAttachment> {
    const attachment = await this.prisma.clinicalAttachment.findUnique({ where: { id: documentId } });
    if (!attachment || attachment.patientId !== patientId) {
      throw new NotFoundException("Documento no encontrado.");
    }
    return attachment;
  }

  async getBytes(documentId: string): Promise<{ attachment: ClinicalAttachment; buffer: Buffer; contentType: string }> {
    const attachment = await this.prisma.clinicalAttachment.findUnique({ where: { id: documentId } });
    if (!attachment) {
      throw new NotFoundException("Documento no encontrado.");
    }
    // El mimeType guardado en la fila es la fuente autoritativa —
    // más preciso que lo que el adaptador de disco re-infiere de la
    // extensión del fileKey.
    const { buffer } = await this.fileStorage.retrieve(attachment.fileKey);
    return { attachment, buffer, contentType: attachment.mimeType };
  }
}
