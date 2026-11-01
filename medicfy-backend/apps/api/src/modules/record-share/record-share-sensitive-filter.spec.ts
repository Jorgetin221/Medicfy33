import { describe, expect, it } from "vitest";
import { isIcd10CodeExcluded, sensitiveCategoriesForIcd10Code, sensitiveCategoryForAtcCode } from "./record-share-sensitive-filter.util";

describe("sensitiveCategoriesForIcd10Code", () => {
  it("clasifica un código sin capturar como sin categoría (nunca se inventa)", () => {
    expect(sensitiveCategoriesForIcd10Code(null)).toEqual([]);
  });

  it("MENTAL_HEALTH cubre todo el capítulo F", () => {
    expect(sensitiveCategoriesForIcd10Code("F32.9")).toEqual(["MENTAL_HEALTH"]);
    expect(sensitiveCategoriesForIcd10Code("F99")).toEqual(["MENTAL_HEALTH"]);
  });

  it("F10-F19 matchea MENTAL_HEALTH Y SUBSTANCE_USE a la vez (a propósito)", () => {
    expect(sensitiveCategoriesForIcd10Code("F10.2")).toEqual(expect.arrayContaining(["MENTAL_HEALTH", "SUBSTANCE_USE"]));
    expect(sensitiveCategoriesForIcd10Code("F10.2")).toHaveLength(2);
  });

  it("HIV_STI cubre B20-B24, Z21 y A50-A64", () => {
    expect(sensitiveCategoriesForIcd10Code("B20")).toEqual(["HIV_STI"]);
    expect(sensitiveCategoriesForIcd10Code("Z21")).toEqual(["HIV_STI"]);
    expect(sensitiveCategoriesForIcd10Code("A55")).toEqual(["HIV_STI"]);
    expect(sensitiveCategoriesForIcd10Code("A49.9")).toEqual([]); // justo fuera del rango
    expect(sensitiveCategoriesForIcd10Code("A65")).toEqual([]); // justo fuera del rango
  });

  it("REPRODUCTIVE_HEALTH cubre O00-O08 y Z30 — nunca el embarazo activo (es otro mecanismo)", () => {
    expect(sensitiveCategoriesForIcd10Code("O05.1")).toEqual(["REPRODUCTIVE_HEALTH"]);
    expect(sensitiveCategoriesForIcd10Code("Z30")).toEqual(["REPRODUCTIVE_HEALTH"]);
  });

  it("un código fuera de todos los rangos no tiene categoría", () => {
    expect(sensitiveCategoriesForIcd10Code("E11.9")).toEqual([]);
  });
});

describe("isIcd10CodeExcluded", () => {
  it("oculta si CUALQUIERA de sus categorías coincidentes está excluida (fail-closed)", () => {
    expect(isIcd10CodeExcluded("F10.2", ["SUBSTANCE_USE"])).toBe(true);
    expect(isIcd10CodeExcluded("F10.2", ["MENTAL_HEALTH"])).toBe(true);
  });

  it("no oculta si ninguna categoría coincidente está excluida", () => {
    expect(isIcd10CodeExcluded("F10.2", ["HIV_STI"])).toBe(false);
    expect(isIcd10CodeExcluded("E11.9", ["MENTAL_HEALTH"])).toBe(false);
  });

  it("un código sin capturar nunca se oculta por este mecanismo", () => {
    expect(isIcd10CodeExcluded(null, ["MENTAL_HEALTH", "HIV_STI", "REPRODUCTIVE_HEALTH", "SUBSTANCE_USE", "GENETIC"])).toBe(false);
  });
});

describe("sensitiveCategoryForAtcCode (construido, no aplicado hoy — ver plan)", () => {
  it("reconoce los tres ejemplos literales de la letra", () => {
    expect(sensitiveCategoryForAtcCode("J05AF")).toBe("HIV_STI");
    expect(sensitiveCategoryForAtcCode("N05AH")).toBe("MENTAL_HEALTH");
    expect(sensitiveCategoryForAtcCode("N06AB")).toBe("MENTAL_HEALTH");
  });

  it("un código ATC fuera de la lista (no exhaustiva) no clasifica", () => {
    expect(sensitiveCategoryForAtcCode("A02BC")).toBeNull();
    expect(sensitiveCategoryForAtcCode(null)).toBeNull();
  });
});
