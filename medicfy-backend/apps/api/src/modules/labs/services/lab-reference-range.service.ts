import { HttpStatus, Injectable } from "@nestjs/common";
import type { LabReferenceRange } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { normalizeTerm } from "../../catalog/term-normalizer.util";
import { evaluateLabValue, type LabValueEvaluation } from "../lab-value-evaluator.util";

type Sex = "M" | "F";

// A-15: "mg/dL" y "mg/dl " son la misma unidad; "mmol/L" no.
function normalizeUnit(unit: string): string {
  return unit.replace(/\s+/g, "").toLowerCase();
}

// A-15: además del estado, se informa si el rango aplicado del sistema
// todavía no tiene revisión médica (M10-RN-009 ordena usarlo igual —
// "pendiente de revisión no es lo mismo que inválido"; lo que no puede
// es presentarse como si estuviera validado).
export type AnalyteEvaluation = LabValueEvaluation & { rangePendingReview: boolean };

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
  private async findApplicable(analyteKey: string, sex: Sex, ageYears: number, unit?: string): Promise<LabReferenceRange | null> {
    const rows = await this.prisma.labReferenceRange.findMany({
      where: {
        analyteKey,
        sex: { in: [sex, "ANY"] },
        ageMinYears: { lte: ageYears },
        ageMaxYears: { gte: ageYears },
      },
    });
    // A-15: un rango en mg/dL no puede calificar un valor en mmol/L.
    const candidates = unit === undefined ? rows : rows.filter((r) => normalizeUnit(r.unit) === normalizeUnit(unit));
    const [mostSpecific] = [...candidates].sort((a, b) => {
      if (a.sex !== b.sex) return a.sex === sex ? -1 : 1;
      const widthA = Number(a.ageMaxYears) - Number(a.ageMinYears);
      const widthB = Number(b.ageMaxYears) - Number(b.ageMinYears);
      return widthA - widthB;
    });
    return mostSpecific ?? null;
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
    printedRange?: { min: number; max: number } | null,
    unit?: string
  ): Promise<AnalyteEvaluation> {
    if (printedRange) {
      return { ...evaluateLabValue({ value, printedRange }), rangePendingReview: false };
    }
    const analyteKey = normalizeTerm(analyteName);
    const systemRange = await this.findApplicable(analyteKey, sex, ageYears, unit);
    const evaluation = evaluateLabValue({
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
    return { ...evaluation, rangePendingReview: systemRange?.pendingMedicalReview ?? false };
  }
}
