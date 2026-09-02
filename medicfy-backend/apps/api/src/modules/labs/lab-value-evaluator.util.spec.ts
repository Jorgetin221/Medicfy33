import { describe, expect, it } from "vitest";
import { evaluateLabValue } from "./lab-value-evaluator.util";

describe("evaluateLabValue() — M10-RN-008, prioridad hoja > sistema > desconocido", () => {
  it("dentro del rango impreso de la hoja: normal", () => {
    expect(evaluateLabValue({ value: 95, printedRange: { min: 70, max: 99 } })).toEqual({
      status: "normal",
      rangeMin: 70,
      rangeMax: 99,
      rangeSource: "sheet",
    });
  });

  it("por debajo del rango impreso: bajo", () => {
    expect(evaluateLabValue({ value: 60, printedRange: { min: 70, max: 99 } }).status).toBe("low");
  });

  it("por encima del rango impreso: alto", () => {
    expect(evaluateLabValue({ value: 130, printedRange: { min: 70, max: 99 } }).status).toBe("high");
  });

  it("un rango impreso nunca produce 'crítico' — la hoja no trae valor de pánico", () => {
    const result = evaluateLabValue({ value: 500, printedRange: { min: 70, max: 99 } });
    expect(result.status).toBe("high");
    expect(result.status).not.toBe("critical");
  });

  it("sin rango impreso, usa el rango del sistema", () => {
    const result = evaluateLabValue({ value: 300, systemRange: { min: 70, max: 100, criticalMax: 250 } });
    expect(result).toEqual({ status: "critical", rangeMin: 70, rangeMax: 100, rangeSource: "system" });
  });

  it("el rango impreso tiene prioridad aunque exista rango del sistema", () => {
    const result = evaluateLabValue({
      value: 95,
      printedRange: { min: 70, max: 99 },
      systemRange: { min: 60, max: 110, criticalMax: 90 },
    });
    expect(result.rangeSource).toBe("sheet");
    expect(result.status).toBe("normal");
  });

  it("sin ningún rango: desconocido", () => {
    expect(evaluateLabValue({ value: 95 })).toEqual({ status: "unknown", rangeMin: null, rangeMax: null, rangeSource: "none" });
  });

  it("crítico por debajo del mínimo crítico también se marca crítico, no solo bajo", () => {
    const result = evaluateLabValue({ value: 30, systemRange: { min: 70, max: 100, criticalMin: 40 } });
    expect(result.status).toBe("critical");
  });

  it("valor exactamente en el borde del rango cuenta como normal (inclusive)", () => {
    expect(evaluateLabValue({ value: 70, printedRange: { min: 70, max: 99 } }).status).toBe("normal");
    expect(evaluateLabValue({ value: 99, printedRange: { min: 70, max: 99 } }).status).toBe("normal");
  });
});
