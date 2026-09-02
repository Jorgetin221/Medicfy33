import { HttpStatus, Injectable } from "@nestjs/common";
import type { LabReferenceRange } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { normalizeTerm } from "../../catalog/term-normalizer.util";
import { evaluateLabValue, type LabValueEvaluation } from "../lab-value-evaluator.util";

type Sex = "M" | "F";

// Capa 2 (v2.5) — tabla curada propia (M10-RN-008/009), sin
// precedente previo en la especificación. pendingMedicalReview NO
// excluye una fila de usarse para marcar fuera de rango — "pendiente
// de revisión no es lo mismo que inválido" (M10-RN-009); solo decide
// si ya la aprobó un CURATOR/SUPERADMIN.
@Injectable()
export class LabReferenceRangeService {
  constructor(private readonly prisma: PrismaService) {}

  async list(pendingOnly: boolean): Promise<LabReferenceRange[]> {
    return this.prisma.labReferenceRange.findMany({
      where: pendingOnly ? { pendingMedicalReview: true } : {},
      orderBy: { createdAt: "asc" },
    });
  }

  async approve(id: string, curatorUserId: string): Promise<LabReferenceRange> {
    const range = await this.prisma.labReferenceRange.findUnique({ where: { id } });
    if (!range) {
      throw new ApiException("LAB_REFERENCE_RANGE_NOT_FOUND", "Rango de referencia no encontrado.", HttpStatus.NOT_FOUND);
    }
    return this.prisma.labReferenceRange.update({
      where: { id },
      data: { pendingMedicalReview: false, curatedBy: curatorUserId },
    });
  }

  // La celda más específica gana: sexo exacto antes que ANY, y entre
  // varias franjas de edad que ajusten, la más angosta (más
  // específica para ese paciente) antes que una franja amplia.
  private async findApplicable(analyteKey: string, sex: Sex, ageYears: number): Promise<LabReferenceRange | null> {
    const candidates = await this.prisma.labReferenceRange.findMany({
      where: {
        analyteKey,
        sex: { in: [sex, "ANY"] },
        ageMinYears: { lte: ageYears },
        ageMaxYears: { gte: ageYears },
      },
    });
    if (candidates.length === 0) return null;
    return [...candidates].sort((a, b) => {
      if (a.sex !== b.sex) return a.sex === sex ? -1 : 1;
      const widthA = Number(a.ageMaxYears) - Number(a.ageMinYears);
      const widthB = Number(b.ageMaxYears) - Number(b.ageMinYears);
      return widthA - widthB;
    })[0]!;
  }

  // Orquesta la Capa 2 completa para un analito: normaliza el nombre,
  // resuelve el rango aplicable si no hay uno impreso con confianza
  // suficiente, y delega el marcado a la función pura. Usado por la
  // Capa 3 (congelado en sign()) y la Capa 4 (bloque de contexto del
  // asistente) — ambas necesitan exactamente el mismo cálculo.
  async evaluateForAnalyte(
    analyteName: string,
    value: number,
    sex: Sex,
    ageYears: number,
    printedRange?: { min: number; max: number } | null
  ): Promise<LabValueEvaluation> {
    if (printedRange) {
      return evaluateLabValue({ value, printedRange });
    }
    const analyteKey = normalizeTerm(analyteName);
    const systemRange = await this.findApplicable(analyteKey, sex, ageYears);
    return evaluateLabValue({
      value,
      systemRange: systemRange
        ? {
            min: Number(systemRange.valueMin),
            max: Number(systemRange.valueMax),
            ...(systemRange.criticalMin !== null ? { criticalMin: Number(systemRange.criticalMin) } : {}),
            ...(systemRange.criticalMax !== null ? { criticalMax: Number(systemRange.criticalMax) } : {}),
          }
        : null,
    });
  }
}
