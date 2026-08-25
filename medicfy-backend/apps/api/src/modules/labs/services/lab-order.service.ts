import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { LabOrderCreateInput, LabResultUploadMetadataInput } from "@medicfy/contracts";
import { ApiException } from "../../../common/api-exception";
import { PrismaService } from "../../../prisma/prisma.service";
import { sha256Hex } from "../../../common/content-hash.util";
import { nextLabOrderFolio } from "../../../common/folio.util";
import { omitUndefined } from "../../../common/omit-undefined";
import { buildLegalSnapshot } from "../../../common/legal-snapshot.util";
import { SignatureVerificationService } from "../../identity/services/signature-verification.service";
import { FILE_STORAGE_PORT, type FileStoragePort } from "../../doctors/services/file-storage.port";
import { LabOrderPdfService } from "./lab-order-pdf.service";

// M10 — ÓRDENES DE LABORATORIO (parcial en MVP, spec §2.2): PDF
// firmado, sin portal de laboratorio. R1: lab_orders es append-only
// real (ver schema.prisma) — "cancelar" es una fila nueva en
// LabOrderCancellation, nunca un UPDATE.
@Injectable()
export class LabOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signatureVerification: SignatureVerificationService,
    private readonly pdfService: LabOrderPdfService,
    @Inject(FILE_STORAGE_PORT) private readonly fileStorage: FileStoragePort
  ) {}

  // A diferencia de recetas (M9-RN-009), ninguna regla M10 exige
  // contraseña+TOTP — la firma electrónica es opcional (a petición
  // explícita del usuario, 2026-08-25). verify() solo aplica a la
  // ruta ELECTRONIC — el discriminated union de LabOrderCreateInput
  // ya garantiza que password/totpCode ni siquiera existen en el
  // input cuando la ruta es HANDWRITTEN_AFTER_PRINT.
  async create(encounterId: string, doctorId: string, doctorUserId: string, patientId: string, input: LabOrderCreateInput) {
    if (input.signatureRoute === "ELECTRONIC") {
      await this.signatureVerification.verify(doctorUserId, input.password, input.totpCode);
    }

    const [doctor, patient] = await Promise.all([
      this.prisma.doctor.findUnique({ where: { id: doctorId }, include: { primarySpecialty: true, locations: { where: { isPrimary: true }, take: 1 } } }),
      this.prisma.patient.findUnique({ where: { id: patientId } }),
    ]);
    if (!doctor || !patient) {
      throw new ApiException("LAB_ORDER_MISSING_LEGAL_FIELD", "No se pudo resolver médico o paciente para la orden.", HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const folio = await nextLabOrderFolio(this.prisma);
    const issuedAt = new Date();
    const snapshot = buildLegalSnapshot(doctor, patient);
    const fastingRequired = input.fastingRequired ?? false;
    const items = input.items.map((item) => ({
      studyName: item.studyName,
      ...omitUndefined({ loincCode: item.loincCode, notes: item.notes }),
    }));

    // Conveniencia impresa (ver LabOrderPdfService) — nunca una firma
    // con validez legal electrónica, mismo principio que ya declara
    // Perfil. Solo se estampa en la ruta autógrafa y solo si el
    // médico ya cargó su firma visual.
    let visualSignatureImage: Buffer | undefined;
    if (input.signatureRoute === "HANDWRITTEN_AFTER_PRINT" && doctor.signatureImageUrl) {
      visualSignatureImage = (await this.fileStorage.retrieve(doctor.signatureImageUrl)).buffer;
    }

    const qrVerificationToken = randomUUID();
    const contentHashSha256 = sha256Hex({ folio, snapshot, items, clinicalIndication: input.clinicalIndication, fastingRequired, issuedAt });

    // Huella documental y PDF se generan ANTES del insert, con datos
    // ya calculados localmente — nunca hay un segundo paso de UPDATE
    // sobre la fila (R1). Mismo orden que PrescriptionService.create().
    const pdfBuffer = await this.pdfService.generate({
      folio,
      issuedAt,
      signatureRoute: input.signatureRoute,
      signatureTimestamp: input.signatureRoute === "ELECTRONIC" ? issuedAt : null,
      ...snapshot,
      clinicalIndication: input.clinicalIndication,
      fastingRequired,
      items,
      qrVerificationToken,
      ...omitUndefined({ visualSignatureImage }),
    });
    const pdfFileKey = `lab-orders/${folio}/orden.pdf`;
    await this.fileStorage.store({ fileKey: pdfFileKey, buffer: pdfBuffer, contentType: "application/pdf" });

    return this.prisma.labOrder.create({
      data: {
        encounterId,
        patientId,
        doctorId,
        folio,
        clinicalIndication: input.clinicalIndication,
        fastingRequired,
        ...snapshot,
        signatureRoute: input.signatureRoute,
        contentHashSha256,
        qrVerificationToken,
        pdfFileKey,
        ...omitUndefined({
          signatureMethod: input.signatureRoute === "ELECTRONIC" ? ("INTERNAL_SYSTEM" as const) : undefined,
          signedAt: input.signatureRoute === "ELECTRONIC" ? issuedAt : undefined,
        }),
        items: { create: items },
      },
      include: { items: true },
    });
  }

  async getPdf(labOrderId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const labOrder = await this.prisma.labOrder.findUnique({ where: { id: labOrderId } });
    if (!labOrder?.pdfFileKey) {
      throw new ApiException("LAB_ORDER_PDF_NOT_FOUND", "No hay un PDF disponible para esta orden.", HttpStatus.NOT_FOUND);
    }
    return this.fileStorage.retrieve(labOrder.pdfFileKey);
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
