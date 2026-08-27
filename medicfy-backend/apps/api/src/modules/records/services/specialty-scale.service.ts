import { HttpStatus, Injectable } from "@nestjs/common";
import type { SpecialtyFieldSchema, SpecialtyFieldSection } from "@prisma/client";
import { ApiException } from "../../../common/api-exception";
import { PrismaService } from "../../../prisma/prisma.service";

interface ScaleFieldValue {
  value: number;
  interpretation?: string;
}

// SpecialtyFieldSchema/EncounterSpecialtyData ya existían completos en
// el esquema (M8-RN-014) — nada en la aplicación los usaba. Esto es lo
// que faltaba conectar, acotado a la sección ESCALAS. computedFormula
// se define aquí por primera vez: una lista de fieldKey separados por
// espacio que se SUMAN — nunca un evaluador de expresiones genérico
// (Glasgow y Apgar son ambos sumas puras; una escala ponderada futura
// es un cambio explícito de ese momento, no algo especulativo ahora).
@Injectable()
export class SpecialtyScaleService {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveFields(specialtyId: string | null, section: SpecialtyFieldSection): Promise<SpecialtyFieldSchema[]> {
    return this.prisma.specialtyFieldSchema.findMany({
      where: { section, publishedAt: { not: null }, OR: [{ specialtyId }, { specialtyId: null }] },
      orderBy: { displayOrder: "asc" },
    });
  }

  // Autoritativo — se llama tanto desde updateDraft() (vista previa en
  // vivo, se recalcula en cada autoguardado) como desde sign() (el
  // único resultado que de verdad se persiste en
  // EncounterSpecialtyData). Nunca confía en un total que venga del
  // cliente: specialtyData solo trae valores crudos (contrato), los
  // COMPUTED siempre se recalculan aquí.
  computeAndValidate(fields: SpecialtyFieldSchema[], rawValues: Record<string, number>): Record<string, ScaleFieldValue> {
    const result: Record<string, ScaleFieldValue> = {};

    for (const field of fields) {
      if (field.inputType === "COMPUTED") continue;
      const value = rawValues[field.fieldKey];
      if (value === undefined) continue;

      if (field.minValue !== null && value < field.minValue) {
        throw new ApiException("SCALE_VALUE_OUT_OF_RANGE", `${field.label}: el valor mínimo permitido es ${field.minValue}.`, HttpStatus.BAD_REQUEST);
      }
      if (field.maxValue !== null && value > field.maxValue) {
        throw new ApiException("SCALE_VALUE_OUT_OF_RANGE", `${field.label}: el valor máximo permitido es ${field.maxValue}.`, HttpStatus.BAD_REQUEST);
      }
      if (Array.isArray(field.options) && field.options.length > 0 && !field.options.some((opt) => isOptionValue(opt, value))) {
        throw new ApiException("SCALE_VALUE_OUT_OF_RANGE", `${field.label}: el valor no corresponde a ninguna opción válida.`, HttpStatus.BAD_REQUEST);
      }
      result[field.fieldKey] = { value };
    }

    for (const field of fields) {
      if (field.inputType !== "COMPUTED" || !field.computedFormula) continue;
      const componentKeys = field.computedFormula.split(" ").filter(Boolean);
      if (componentKeys.some((key) => result[key] === undefined)) continue;
      const total = componentKeys.reduce((sum, key) => sum + (result[key]?.value ?? 0), 0);
      const interpretation = resolveInterpretationBucket(field.options, total);
      result[field.fieldKey] = interpretation !== undefined ? { value: total, interpretation } : { value: total };
    }

    return result;
  }
}

function isOptionValue(opt: unknown, value: number): boolean {
  return typeof opt === "object" && opt !== null && "value" in opt && (opt as { value: unknown }).value === value;
}

function resolveInterpretationBucket(options: unknown, total: number): string | undefined {
  if (!Array.isArray(options)) return undefined;
  const bucket = options.find(
    (opt): opt is { min: number; max: number; label: string } =>
      typeof opt === "object" &&
      opt !== null &&
      "min" in opt &&
      "max" in opt &&
      "label" in opt &&
      total >= (opt as { min: number }).min &&
      total <= (opt as { max: number }).max
  );
  return bucket?.label;
}
