import { HttpStatus, Injectable } from "@nestjs/common";
import type { ClinicalNoteCancellation } from "@prisma/client";
import type { ClinicalNoteCancelInput } from "@medicfy/contracts";
import { ApiException } from "../../../common/api-exception";
import { PrismaService } from "../../../prisma/prisma.service";
import { SignatureVerificationService } from "../../identity/services/signature-verification.service";

const REASON_DOMAIN = "MOTIVO_CANCELACION_NOTA";

// Fase 6 · Prompt 44B: "motivo obligatorio tomado de catálogo, más
// firma. El registro se marca cancelado, NUNCA se elimina, y sigue
// siendo consultable." ClinicalNoteCancellation (schema.prisma) es
// una tabla separada, append-only por su propio GRANT — su sola
// existencia ES el estado "cancelada", nunca un UPDATE sobre
// clinical_notes.
@Injectable()
export class ClinicalNoteCancellationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signatureVerification: SignatureVerificationService
  ) {}

  async cancel(
    encounterId: string,
    noteId: string,
    doctorUserId: string,
    input: ClinicalNoteCancelInput
  ): Promise<ClinicalNoteCancellation> {
    // "más firma" — mismo mecanismo que firmar/corregir.
    await this.signatureVerification.verify(doctorUserId, input.password, input.totpCode);

    const note = await this.prisma.clinicalNote.findUnique({ where: { id: noteId }, include: { cancellation: true } });
    if (!note || note.encounterId !== encounterId) {
      throw new ApiException("NOTE_NOT_FOUND", "La nota no existe o no pertenece a este encuentro.", HttpStatus.NOT_FOUND);
    }
    if (note.cancellation) {
      throw new ApiException("NOTE_ALREADY_CANCELLED", "Esta nota ya está cancelada.", HttpStatus.CONFLICT);
    }

    const reasonTerm = await this.prisma.clinicalCatalogTerm.findUnique({ where: { id: input.reasonTermId } });
    if (!reasonTerm || reasonTerm.domain !== REASON_DOMAIN) {
      throw new ApiException("VALIDATION_ERROR", "Motivo de cancelación inválido.", HttpStatus.BAD_REQUEST);
    }

    return this.prisma.clinicalNoteCancellation.create({
      data: {
        noteId,
        reasonTermId: input.reasonTermId,
        reasonFreeText: input.reasonFreeText ?? null,
        cancelledByUserId: doctorUserId,
      },
    });
  }
}
