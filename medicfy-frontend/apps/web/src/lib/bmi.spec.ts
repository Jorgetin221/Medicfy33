import { describe, expect, it } from "vitest";
import { bmiCategory, computeBmi } from "./bmi";

describe("computeBmi", () => {
  it("usa la misma fórmula y redondeo que el servidor", () => {
    expect(computeBmi(68, 162)).toBe(25.9);
    expect(computeBmi(80, 180)).toBe(24.7);
  });

  it("sin peso o talla no hay IMC", () => {
    expect(computeBmi(undefined, 170)).toBeNull();
    expect(computeBmi(70, undefined)).toBeNull();
    expect(computeBmi(70, 0)).toBeNull();
  });
});

describe("bmiCategory", () => {
  it("clasifica adultos con los cortes de la OMS", () => {
    expect(bmiCategory(17.9, 30)).toBe("BAJO_PESO");
    expect(bmiCategory(18.5, 30)).toBe("NORMAL");
    expect(bmiCategory(25, 30)).toBe("SOBREPESO");
    expect(bmiCategory(30, 30)).toBe("OBESIDAD_I");
    expect(bmiCategory(35, 30)).toBe("OBESIDAD_II");
    expect(bmiCategory(40.2, 30)).toBe("OBESIDAD_III");
  });

  it("no clasifica a menores de 18 ni sin edad", () => {
    expect(bmiCategory(30, 12)).toBeNull();
    expect(bmiCategory(30, null)).toBeNull();
  });
});
