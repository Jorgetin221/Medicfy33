import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../prisma/prisma.service";
import { LabReferenceRangeService } from "./lab-reference-range.service";

// Capa 2 — evaluateForAnalyte() contra la base real (no un doble):
// esta es la orquestación completa (normalización + consulta +
// prioridad sexo/edad), la pieza que el test puro de
// lab-value-evaluator.util.spec.ts no cubre porque ahí el rango ya
// llega resuelto.
describe("LabReferenceRangeService.evaluateForAnalyte() — resolución real contra lab_reference_ranges", () => {
  let prisma: PrismaService;
  let service: LabReferenceRangeService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ providers: [LabReferenceRangeService, PrismaService] }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(LabReferenceRangeService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("un rango impreso en la hoja tiene prioridad sobre el rango del sistema, aunque exista y aplique", async () => {
    const analyteKey = `hormona-prueba-${randomUUID()}`;
    await prisma.labReferenceRange.create({
      data: {
        analyteKey,
        analyteLabel: "Hormona de prueba",
        unit: "ng/mL",
        sex: "ANY",
        ageMinYears: 0,
        ageMaxYears: 120,
        valueMin: 1,
        valueMax: 2,
        pendingMedicalReview: true,
        source: "prueba",
      },
    });

    const result = await service.evaluateForAnalyte("Hormona de prueba", 5, "F", 30, { min: 4, max: 6 });
    expect(result).toEqual({ status: "normal", rangeMin: 4, rangeMax: 6, rangeSource: "sheet" });
  });

  it("sin rango impreso, resuelve por analyteKey normalizado + sexo específico sobre ANY", async () => {
    const label = `Analito Sexo Especifico ${randomUUID()}`;
    const analyteKey = label.toLowerCase();
    await prisma.labReferenceRange.createMany({
      data: [
        { analyteKey, analyteLabel: label, unit: "U/L", sex: "ANY", ageMinYears: 0, ageMaxYears: 120, valueMin: 0, valueMax: 100, source: "prueba" },
        { analyteKey, analyteLabel: label, unit: "U/L", sex: "F", ageMinYears: 0, ageMaxYears: 120, valueMin: 10, valueMax: 20, source: "prueba" },
      ],
    });

    const result = await service.evaluateForAnalyte(label, 15, "F", 30);
    expect(result.rangeSource).toBe("system");
    expect(result.rangeMin).toBe(10);
    expect(result.rangeMax).toBe(20);
    expect(result.status).toBe("normal");
  });

  it("sin ningún rango aplicable (analito desconocido), regresa unknown sin lanzar", async () => {
    const result = await service.evaluateForAnalyte(`Inexistente ${randomUUID()}`, 5, "M", 30);
    expect(result).toEqual({ status: "unknown", rangeMin: null, rangeMax: null, rangeSource: "none" });
  });

  it("fuera de la franja de edad del rango específico, cae a un rango que sí cubra esa edad (o unknown si ninguno aplica)", async () => {
    const label = `Analito Pediatrico ${randomUUID()}`;
    const analyteKey = label.toLowerCase();
    await prisma.labReferenceRange.create({
      data: { analyteKey, analyteLabel: label, unit: "mg/dL", sex: "ANY", ageMinYears: 0, ageMaxYears: 12, valueMin: 5, valueMax: 15, source: "prueba" },
    });

    const adultResult = await service.evaluateForAnalyte(label, 10, "M", 30);
    expect(adultResult.rangeSource).toBe("none");
    expect(adultResult.status).toBe("unknown");

    const childResult = await service.evaluateForAnalyte(label, 10, "M", 8);
    expect(childResult.rangeSource).toBe("system");
    expect(childResult.status).toBe("normal");
  });
});
