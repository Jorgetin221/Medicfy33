import { HttpStatus, Injectable } from "@nestjs/common";
import type { LabResultAnalyte } from "@prisma/client";
import type { LabResultAnalyteCreateInput } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";

// Fase 5 · Prompt 42A: "Resultados de laboratorio como analitos
// ESTRUCTURADOS ... NO como un PDF adjunto ni como número de orden."
// Complementa LabResult/LabOrderService (el archivo crudo) sin
// reemplazarlo — captura manual del médico, sin OCR/parseo automático.
@Injectable()
export class LabResultAnalyteService {
  constructor(private readonly prisma: PrismaService) {}

  async create(patientId: string, enteredByUserId: string, input: LabResultAnalyteCreateInput): Promise<LabResultAnalyte> {
    return this.prisma.labResultAnalyte.create({
      data: {
        patientId,
        labOrderId: input.labOrderId ?? null,
        analyteName: input.analyteName,
        loincCode: input.loincCode ?? null,
        value: input.value,
        unit: input.unit,
        referenceMin: input.referenceMin ?? null,
        referenceMax: input.referenceMax ?? null,
        measuredAt: new Date(input.measuredAt),
        enteredByUserId,
      },
    });
  }

  async listForPatient(patientId: string): Promise<LabResultAnalyte[]> {
    return this.prisma.labResultAnalyte.findMany({
      where: { patientId },
      orderBy: { measuredAt: "asc" },
    });
  }

  // Mismo hallazgo del Bloque 0 que ya obligó a LabOrderService a
  // comparar patientId en reviewResult(): el guard valida el paciente
  // de la RUTA, no el dueño de la fila — sin este check, un
  // analyteId ajeno con un patientId propio se marcaría revisado en
  // el expediente equivocado.
  //
  // Sin doctorComment a propósito: el prompt 42A solo pide que la
  // acción "deje constancia" (quién revisó y cuándo) — a diferencia de
  // LabResult.doctorComment (M10, comentario clínico sobre el archivo
  // subido), aquí no hay un requisito de comentario que forzar.
  async markReviewed(analyteId: string, patientId: string, doctorId: string): Promise<LabResultAnalyte> {
    const analyte = await this.prisma.labResultAnalyte.findUnique({ where: { id: analyteId } });
    if (!analyte || analyte.patientId !== patientId) {
      throw new ApiException("LAB_RESULT_ANALYTE_NOT_FOUND", "Analito no encontrado.", HttpStatus.NOT_FOUND);
    }
    return this.prisma.labResultAnalyte.update({
      where: { id: analyteId },
      data: { reviewedByDoctorId: doctorId, reviewedAt: new Date() },
    });
  }
}
