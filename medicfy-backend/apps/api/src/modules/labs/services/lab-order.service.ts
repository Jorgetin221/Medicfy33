import { HttpStatus, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { LabOrderCreateInput, LabResultUploadMetadataInput } from "@medicfy/contracts";
import { ApiException } from "../../../common/api-exception";
import { PrismaService } from "../../../prisma/prisma.service";
import { sha256Hex } from "../../../common/content-hash.util";
import { nextLabOrderFolio } from "../../../common/folio.util";
import { omitUndefined } from "../../../common/omit-undefined";
import { SignatureVerificationService } from "../../identity/services/signature-verification.service";

// M10 — ÓRDENES DE LABORATORIO (parcial en MVP, spec §2.2): PDF
// firmado, sin portal de laboratorio. R1: lab_orders es append-only
// real (ver schema.prisma) — "cancelar" es una fila nueva en
// LabOrderCancellation, nunca un UPDATE.
@Injectable()
export class LabOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signatureVerification: SignatureVerificationService
  ) {}

  async create(encounterId: string, doctorId: string, doctorUserId: string, patientId: string, input: LabOrderCreateInput) {
    await this.signatureVerification.verify(doctorUserId, input.password, input.totpCode);

    const folio = await nextLabOrderFolio(this.prisma);
    const signedAt = new Date();
    const qrVerificationToken = randomUUID();
    const contentHashSha256 = sha256Hex({ folio, items: input.items, clinicalIndication: input.clinicalIndication, signedAt });

    return this.prisma.labOrder.create({
      data: {
        encounterId,
        patientId,
        doctorId,
        folio,
        clinicalIndication: input.clinicalIndication,
        fastingRequired: input.fastingRequired ?? false,
        signatureMethod: "INTERNAL_SYSTEM",
        signedAt,
        contentHashSha256,
        qrVerificationToken,
        items: {
          create: input.items.map((item) => ({
            studyName: item.studyName,
            ...omitUndefined({ loincCode: item.loincCode, notes: item.notes }),
          })),
        },
      },
      include: { items: true },
    });
  }

  async cancel(labOrderId: string, cancelledByUserId: string, reason: string) {
    const labOrder = await this.prisma.labOrder.findUnique({ where: { id: labOrderId }, include: { cancellation: true } });
    if (!labOrder) {
      throw new ApiException("LAB_ORDER_NOT_FOUND", "Orden de laboratorio no encontrada.", HttpStatus.NOT_FOUND);
    }
    if (labOrder.cancellation) {
      throw new ApiException("LAB_ORDER_ALREADY_CANCELLED", "Esta orden ya fue cancelada.", HttpStatus.CONFLICT);
    }
    return this.prisma.labOrderCancellation.create({ data: { labOrderId, reason, cancelledByUserId } });
  }

  // §6.7: v1.0 sube el médico o el paciente. Sin assignedLabId activo
  // en MVP — el paciente lo lleva a cualquier laboratorio.
  async uploadResult(
    patientId: string,
    uploadedByUserId: string,
    uploadedByRole: "DOCTOR" | "PATIENT",
    fileKey: string,
    fileHashSha256: string,
    meta: LabResultUploadMetadataInput
  ) {
    return this.prisma.labResult.create({
      data: {
        patientId,
        uploadedByUserId,
        uploadedByRole,
        fileKey,
        fileHashSha256,
        ...omitUndefined({
          labOrderId: meta.labOrderId,
          labName: meta.labName,
          resultDate: meta.resultDate ? new Date(meta.resultDate) : undefined,
        }),
      },
    });
  }

  async reviewResult(resultId: string, doctorId: string, doctorComment: string) {
    const result = await this.prisma.labResult.findUnique({ where: { id: resultId } });
    if (!result) {
      throw new ApiException("LAB_RESULT_NOT_FOUND", "Resultado no encontrado.", HttpStatus.NOT_FOUND);
    }
    return this.prisma.labResult.update({
      where: { id: resultId },
      data: { reviewedByDoctorId: doctorId, reviewedAt: new Date(), doctorComment },
    });
  }

  async getByVerificationToken(token: string) {
    const labOrder = await this.prisma.labOrder.findUnique({ where: { qrVerificationToken: token }, include: { cancellation: true } });
    if (!labOrder) {
      throw new ApiException("LAB_ORDER_NOT_FOUND", "Orden no encontrada.", HttpStatus.NOT_FOUND);
    }
    return {
      folio: labOrder.folio,
      issuedAt: labOrder.issuedAt,
      status: labOrder.cancellation ? "CANCELLED" : "ISSUED",
    };
  }
}
