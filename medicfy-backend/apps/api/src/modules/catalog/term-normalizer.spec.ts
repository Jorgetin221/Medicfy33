import { describe, expect, it } from "vitest";
import { clinicalCatalogTermCreateSchema } from "@medicfy/contracts";
import { normalizeTerm } from "./term-normalizer.util";

// Prompt 8: los 3 casos de prueba reales del prompt, verificados uno
// por uno. Dos son resolubles normalizando (formato y número); el
// tercero es sinonimia y se resuelve en `synonyms` con curaduría
// — decisión del 26 ago 2026, ver term-normalizer.util.ts.
describe("normalizeTerm() — Prompt 8, los 3 casos de prueba del documento", () => {
  it('"hipotiroidismo" y "HIPOTIROIDISMO" normalizan igual — mayúsculas', () => {
    expect(normalizeTerm("hipotiroidismo")).toBe(normalizeTerm("HIPOTIROIDISMO"));
    expect(normalizeTerm("HIPOTIROIDISMO")).toBe("hipotiroidismo");
  });

  it('"Dislipidemias" y "Dislipidemia" normalizan igual — número gramatical', () => {
    expect(normalizeTerm("Dislipidemias")).toBe(normalizeTerm("Dislipidemia"));
    expect(normalizeTerm("Dislipidemias")).toBe("dislipidemia");
  });

  it('"Tiroideas." y "hipotiroidismo" NO normalizan igual — son sinónimos, no una variante de forma', () => {
    expect(normalizeTerm("Tiroideas.")).toBe("tiroidea");
    expect(normalizeTerm("Tiroideas.")).not.toBe(normalizeTerm("hipotiroidismo"));
  });

  it('"Ninguno"/"Ninguna"/"Negados"/"SANO" NO normalizan igual — no comparten raíz; van a `synonyms`', () => {
    const formas = ["Ninguno", "Ninguna", "Negados", "SANO"].map(normalizeTerm);
    expect(new Set(formas).size).toBe(4);
  });

  it("quita acentos, minúsculas, puntuación final y colapsa espacios múltiples", () => {
    expect(normalizeTerm("Múltiples   Espacios  ")).toBe("multiples espacio");
    expect(normalizeTerm("Diabetes?")).toBe("diabetes");
    // "sin puntuación FINAL" es literal — puntuación al inicio no se
    // toca, "¿" en "¿Diabetes?" no es del mismo problema que el
    // prompt describe (espacios/mayúsculas/acentos/final de cadena).
    expect(normalizeTerm("¿Diabetes?")).toBe("¿diabetes");
  });
});

// La ñ es una letra del español, no una vocal acentuada. NFD la parte
// en "n" + U+0303 y el filtro de diacríticos se la comía. Éstas son
// las colisiones que eso producía, y que el índice único
// (domain, normalizedTerm) volvía irresolubles para el curador: no
// podía dar de alta el término legítimo ni ver con qué chocó.
describe("normalizeTerm() — la ñ sobrevive a la eliminación de acentos", () => {
  it.each([
    ["Año", "Ano"],
    ["muñeca", "muneca"],
    ["Niño", "nino"],
  ])('"%s" y "%s" NO colapsan al mismo término', (conEnhe, sinEnhe) => {
    expect(normalizeTerm(conEnhe)).not.toBe(normalizeTerm(sinEnhe));
  });

  it("conserva la ñ en la forma normalizada", () => {
    expect(normalizeTerm("Año")).toBe("año");
    expect(normalizeTerm("MUÑECA")).toBe("muñeca");
  });
});

// La regla de número sólo toca -as/-os, donde el plural español es
// inequívoco. Estas terminaciones ya son singulares: quitarles la "s"
// inventaría un término que no existe, y el falso positivo resultante
// no lo puede resolver nadie.
describe("normalizeTerm() — el número no se toca donde el español es ambiguo", () => {
  it.each(["diabetes", "lentes", "analisis", "artritis", "crisis", "dosis", "lupus", "virus", "atlas"])(
    '"%s" se queda como está',
    (palabra) => {
      expect(normalizeTerm(palabra)).toBe(palabra);
    }
  );
});

describe("clinicalCatalogTermCreateSchema — R2: el sistema de codificación se declara siempre", () => {
  it("rechaza codingSystem vacío u omitido", () => {
    const omitted = clinicalCatalogTermCreateSchema.safeParse({ domain: "ANTECEDENTE", key: "x", preferredTerm: "X" });
    expect(omitted.success).toBe(false);

    const empty = clinicalCatalogTermCreateSchema.safeParse({ domain: "ANTECEDENTE", key: "x", preferredTerm: "X", codingSystem: "" });
    expect(empty.success).toBe(false);
  });

  it("acepta \"PROPIETARIO\" como declaración explícita de que no hay sistema externo", () => {
    const result = clinicalCatalogTermCreateSchema.safeParse({ domain: "ANTECEDENTE", key: "x", preferredTerm: "X", codingSystem: "PROPIETARIO" });
    expect(result.success).toBe(true);
  });
});
