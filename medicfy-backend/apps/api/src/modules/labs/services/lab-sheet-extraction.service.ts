import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type { LabSheetExtraction, LabSheetExtractionCandidate } from "@prisma/client";
import type { LabSheetExtractionReviewInput } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { assertContentMatchesDeclaredType } from "../../../common/file-signature.util";
import { FILE_STORAGE_PORT, type FileStoragePort } from "../../doctors/services/file-storage.port";
import { extensionForMimeType } from "../../doctors/services/local-disk-file-storage.adapter";
import { LAB_OCR_PORT, type LabOcrPort } from "./lab-ocr.port";

export interface LabSheetExtractionWithCandidates extends LabSheetExtraction {
  candidates: LabSheetExtractionCandidate[];
}

// Capa 1 (v2.5) — orquesta subida, lectura (visión de Claude vía
// LAB_OCR_PORT) y revisión. "Ningún valor extraído se escribe en la nota sin que el
// médico lo revise" es estructural aquí: create()/retry() nunca tocan
// lab_result_analytes, solo la tabla de espera — únicamente
// submitReview() promueve, y solo lo que el médico confirmó.
@Injectable()
export class LabSheetExtractionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE_PORT) private readonly fileStorage: FileStoragePort,
    @Inject(LAB_OCR_PORT) private readonly labOcr: LabOcrPort
  ) {}

  async upload(
    patientId: string,
    uploadedByUserId: string,
    file: Express.Multer.File,
    signal: AbortSignal
  ): Promise<LabSheetExtractionWithCandidates> {
    // M-07: lo que se declara PDF/JPG/PNG tiene que serlo de verdad.
    assertContentMatchesDeclaredType(file.buffer, file.mimetype);
    const fileHashSha256 = createHash("sha256").update(file.buffer).digest("hex");
    const fileKey = `lab-sheet-extractions/${patientId}/${randomUUID()}${extensionForMimeType(file.mimetype)}`;
    await this.fileStorage.store({ fileKey, buffer: file.buffer, contentType: file.mimetype });

    const extraction = await this.prisma.labSheetExtraction.create({
      data: { patientId, uploadedByUserId, fileKey, fileHashSha256, status: "EXTRACTING" },
    });

    return this.runExtraction(extraction.id, file.buffer, file.mimetype, signal);
  }

  async retry(extractionId: string, patientId: string, signal: AbortSignal): Promise<LabSheetExtractionWithCandidates> {
    const extraction = await this.getOwned(extractionId, patientId);
    if (extraction.status !== "FAILED") {
      throw new ApiException(
        "LAB_SHEET_EXTRACTION_NOT_FAILED",
        "Solo se puede reintentar una hoja cuya lectura falló.",
        HttpStatus.CONFLICT
      );
    }
    const { buffer, contentType } = await this.fileStorage.retrieve(extraction.fileKey);
    await this.prisma.labSheetExtraction.update({ where: { id: extractionId }, data: { status: "EXTRACTING" } });
    return this.runExtraction(extractionId, buffer, contentType, signal);
  }

  private async runExtraction(
    extractionId: string,
    buffer: Buffer,
    contentType: string,
    signal: AbortSignal
  ): Promise<LabSheetExtractionWithCandidates> {
    const outcome = await this.labOcr.extract({ buffer, contentType, signal });

    if (outcome.kind !== "ok") {
      const failed = await this.prisma.labSheetExtraction.update({
        where: { id: extractionId },
        data: { status: "FAILED" },
      });
      return { ...failed, candidates: [] };
    }

    await this.prisma.labSheetExtractionCandidate.createMany({
      data: outcome.result.candidates.map((c) => ({
        extractionId,
        analyteNameRaw: c.analyteNameRaw,
        valueRaw: c.valueRaw,
        unitRaw: c.unitRaw,
        referenceMinPrinted: c.referenceMinPrinted,
        referenceMaxPrinted: c.referenceMaxPrinted,
        confidence: c.confidence,
      })),
    });

    const updated = await this.prisma.labSheetExtraction.update({
      where: { id: extractionId },
      data: {
        status: outcome.result.candidates.length > 0 ? "REVIEW_PENDING" : "FAILED",
        labNameDetected: outcome.result.labNameDetected,
        resultDateDetected: outcome.result.resultDateDetected ? new Date(outcome.result.resultDateDetected) : null,
      },
      include: { candidates: true },
    });
    return updated;
  }

  async get(extractionId: string, patientId: string): Promise<LabSheetExtractionWithCandidates> {
    const extraction = await this.prisma.labSheetExtraction.findUnique({
      where: { id: extractionId },
      include: { candidates: true },
    });
    if (!extraction || extraction.patientId !== patientId) {
      throw new ApiException("LAB_SHEET_EXTRACTION_NOT_FOUND", "Extracción no encontrada.", HttpStatus.NOT_FOUND);
    }
    return extraction;
  }

  private async getOwned(extractionId: string, patientId: string): Promise<LabSheetExtraction> {
    const extraction = await this.prisma.labSheetExtraction.findUnique({ where: { id: extractionId } });
    if (!extraction || extraction.patientId !== patientId) {
      throw new ApiException("LAB_SHEET_EXTRACTION_NOT_FOUND", "Extracción no encontrada.", HttpStatus.NOT_FOUND);
    }
    return extraction;
  }

  // La regla de oro vive aquí: una candidata de confianza LOW solo se
  // promueve si el médico la editó (su confirmación difiere de lo
  // extraído) O marcó confirmedLowConfidence explícitamente — dejarla
  // tal cual sin esa marca NO basta, aunque included=true.
  async submitReview(
    extractionId: string,
    patientId: string,
    doctorUserId: string,
    input: LabSheetExtractionReviewInput
  ): Promise<{ extraction: LabSheetExtraction; created: number; edited: number }> {
    const extraction = await this.getOwned(extractionId, patientId);
    if (extraction.status !== "REVIEW_PENDING") {
      throw new ApiException(
        "LAB_SHEET_EXTRACTION_NOT_REVIEWABLE",
        "Esta extracción no está pendiente de revisión.",
        HttpStatus.CONFLICT
      );
    }

    const storedCandidates = await this.prisma.labSheetExtractionCandidate.findMany({ where: { extractionId } });
    const storedById = new Map(storedCandidates.map((c) => [c.id, c]));

    // 1) Validar TODO antes de escribir nada: una candidata inválida a
    // la mitad ya no deja la revisión aplicada a medias.
    const reviewed = input.candidates.map((item) => {
      const stored = storedById.get(item.candidateId);
      if (!stored) {
        throw new ApiException("LAB_SHEET_EXTRACTION_CANDIDATE_NOT_FOUND", "Candidata no encontrada.", HttpStatus.NOT_FOUND);
      }

      const wasEdited =
        item.included &&
        (item.analyteName !== stored.analyteNameRaw ||
          item.value === undefined ||
          item.value !== Number(stored.valueRaw.replace(",", ".")) ||
          (item.unit ?? null) !== stored.unitRaw);

      if (item.included && stored.confidence === "LOW" && !wasEdited && !item.confirmedLowConfidence) {
        throw new ApiException(
          "LAB_SHEET_EXTRACTION_LOW_CONFIDENCE_UNCONFIRMED",
          `La candidata "${stored.analyteNameRaw}" tiene confianza baja y necesita confirmación explícita o corrección antes de aceptarse.`,
          HttpStatus.UNPROCESSABLE_ENTITY
        );
      }
      return { item, stored, wasEdited };
    });

    const labName = input.labName ?? extraction.labNameDetected ?? null;
    const edited = reviewed.filter((r) => r.wasEdited).length;

    // 2) M-11: todo en una transacción, y la primera escritura es el
    // compare-and-set del estado. Un doble envío (doble clic, reintento
    // de red) encuentra la extracción ya ACCEPTED y recibe 409 — antes
    // los dos pasaban la validación de arriba y duplicaban los analitos.
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.labSheetExtraction.updateMany({
        where: { id: extractionId, status: "REVIEW_PENDING" },
        data: {
          status: "ACCEPTED",
          reviewedAt: new Date(),
          reviewedByUserId: doctorUserId,
          ...(input.labName ? { labNameDetected: input.labName } : {}),
        },
      });
      if (claimed.count !== 1) {
        throw new ApiException("LAB_SHEET_EXTRACTION_NOT_REVIEWABLE", "Esta extracción no está pendiente de revisión.", HttpStatus.CONFLICT);
      }

      let created = 0;
      for (const { item, stored, wasEdited } of reviewed) {
        await tx.labSheetExtractionCandidate.update({
          where: { id: stored.id },
          data: {
            included: item.included,
            wasEdited,
            doctorConfirmedAnalyteName: item.analyteName ?? null,
            doctorConfirmedValue: item.value ?? null,
            doctorConfirmedUnit: item.unit ?? null,
          },
        });

        if (item.included && item.analyteName && item.value !== undefined && item.unit) {
          const referenceMin = item.referenceMin ?? (stored.referenceMinPrinted ? Number(stored.referenceMinPrinted) : undefined);
          const referenceMax = item.referenceMax ?? (stored.referenceMaxPrinted ? Number(stored.referenceMaxPrinted) : undefined);
          await tx.labResultAnalyte.create({
            data: {
              patientId,
              analyteName: item.analyteName,
              value: item.value,
              unit: item.unit,
              referenceMin: referenceMin ?? null,
              referenceMax: referenceMax ?? null,
              measuredAt: new Date(input.measuredAt),
              enteredByUserId: doctorUserId,
              source: "OCR_REVIEWED",
              labName,
            },
          });
          created += 1;
        }
      }

      const updatedExtraction = await tx.labSheetExtraction.findUniqueOrThrow({ where: { id: extractionId } });
      return { extraction: updatedExtraction, created, edited };
    });
  }
}
