import { describe, expect, it } from "vitest";
import { crossCheckAllergies, type AllergyRecord, type CatalogDrug } from "./allergy-cross-check.util";

// Prompt 34: "Caso de prueba obligatorio: paciente con alergia a
// penicilina y reacción anafiláctica; prescribir amoxicilina debe
// bloquear, explicando que la amoxicilina pertenece al grupo de las
// penicilinas."
//
// Estas pruebas son puras: no tocan Postgres. El cruce es una función
// sin dependencias justamente para que el caso obligatorio se pueda
// ejercitar sin levantar media aplicación.

const REGISTRADA_EL = new Date("2026-03-04T10:00:00.000Z");

function alergia(substance: string, overrides: Partial<AllergyRecord> = {}): AllergyRecord {
  return {
    id: "alergia-1",
    substance,
    reaction: "Anafilaxia",
    severity: "SEVERA",
    source: "Dra. Ruiz",
    createdAt: REGISTRADA_EL,
    ...overrides,
  };
}

// El proyecto compila con noUncheckedIndexedAccess, así que
// `matches[0]` es `T | undefined`. Esto convierte esa incertidumbre en
// un fallo con mensaje claro en vez de un `?.` que haría pasar la
// prueba cuando el arreglo viene vacío.
function unico<T>(items: T[]): T {
  expect(items).toHaveLength(1);
  const [primero] = items;
  if (primero === undefined) throw new Error("se esperaba exactamente un elemento");
  return primero;
}

const AMOXICILINA: CatalogDrug = { id: "med-amox", genericName: "Amoxicilina", brandNames: ["Amoxil", "Penbritin"], atcCode: "J01CA04" };
const NAPROXENO: CatalogDrug = { id: "med-napro", genericName: "Naproxeno", brandNames: ["Flanax"], atcCode: "M01AE02" };
const PARACETAMOL: CatalogDrug = { id: "med-para", genericName: "Paracetamol", brandNames: ["Tempra"], atcCode: "N02BE01" };
const CEFALEXINA: CatalogDrug = { id: "med-cefa", genericName: "Cefalexina", brandNames: [], atcCode: "J01DB01" };
const SIN_ATC: CatalogDrug = { id: "med-sin-atc", genericName: "Fitoterápico X", brandNames: [], atcCode: null };

describe("crossCheckAllergies — el caso obligatorio del prompt 34", () => {
  it("alergia a penicilinas + amoxicilina: dispara por grupo terapéutico", () => {
    const match = unico(crossCheckAllergies([alergia("Penicilinas")], [AMOXICILINA]).matches);

    expect(match.basis).toBe("GRUPO_TERAPEUTICO");
    expect(match.genericName).toBe("Amoxicilina");
    expect(match.explanation).toContain("penicilinas");
    expect(match.explanation).toContain("J01C");
  });

  it("el conflicto lleva la reacción, la gravedad, quién la registró y cuándo", () => {
    const match = unico(crossCheckAllergies([alergia("Penicilinas")], [AMOXICILINA]).matches);

    expect(match).toMatchObject({
      substance: "Penicilinas",
      reaction: "Anafilaxia",
      severity: "SEVERA",
      source: "Dra. Ruiz",
      registeredAt: REGISTRADA_EL,
    });
  });

  it.each(["Penicilinas", "Penicilina", "PENICILINAS", "penicilinas.", "  Penicilinas  "])(
    'la variante de captura "%s" también dispara',
    (substancia) => {
      expect(crossCheckAllergies([alergia(substancia)], [AMOXICILINA]).matches).toHaveLength(1);
    }
  );
});

describe("crossCheckAllergies — los tres criterios", () => {
  it("principio activo exacto", () => {
    const match = unico(crossCheckAllergies([alergia("Amoxicilina")], [AMOXICILINA]).matches);
    expect(match.basis).toBe("PRINCIPIO_ACTIVO");
  });

  it("nombre comercial", () => {
    const match = unico(crossCheckAllergies([alergia("Amoxil")], [AMOXICILINA]).matches);
    expect(match.basis).toBe("NOMBRE_COMERCIAL");
    expect(match.explanation).toContain("Amoxil");
  });

  it.each([
    ["Cefalosporinas", CEFALEXINA],
    ["AINEs", NAPROXENO],
  ])('grupo terapéutico: "%s" dispara con el fármaco de su familia', (substancia, farmaco) => {
    expect(crossCheckAllergies([alergia(substancia)], [farmaco]).matches).toHaveLength(1);
  });
});

// La comparación anterior era por subcadena en las dos direcciones.
// Una alergia capturada como "no" disparaba con "Naproxeno" porque la
// cadena está contenida. Eso es fatiga de alerta: el médico aprende a
// saltarse el aviso.
describe("crossCheckAllergies — no dispara donde no debe", () => {
  it('una alergia capturada como "no" NO dispara con Naproxeno', () => {
    const { matches } = crossCheckAllergies([alergia("no")], [NAPROXENO]);
    expect(matches).toHaveLength(0);
  });

  it("una familia no dispara con un fármaco de otro grupo ATC", () => {
    expect(crossCheckAllergies([alergia("Penicilinas")], [CEFALEXINA]).matches).toHaveLength(0);
    expect(crossCheckAllergies([alergia("Penicilinas")], [PARACETAMOL]).matches).toHaveLength(0);
  });

  it("un fármaco sin código ATC nunca dispara por grupo", () => {
    expect(crossCheckAllergies([alergia("Penicilinas")], [SIN_ATC]).matches).toHaveLength(0);
  });

  it("sin alergias activas no hay conflicto ni advertencia", () => {
    expect(crossCheckAllergies([], [AMOXICILINA, NAPROXENO])).toEqual({ matches: [], unverifiable: [] });
  });
});

// `PatientAllergy.substance` sigue siendo texto libre hasta la Fase 4.
// Una alergia que no se resuelve no es "sin conflicto": es "no lo pude
// comprobar", y eso se le dice al médico.
describe("crossCheckAllergies — degradación honesta", () => {
  it.each(["no", "polvo de casa", "   "])('reporta "%s" como no verificable', (substancia) => {
    const aviso = unico(crossCheckAllergies([alergia(substancia)], [AMOXICILINA]).unverifiable);
    expect(aviso.allergyId).toBe("alergia-1");
  });

  it("una alergia que sí se resuelve NO se reporta como no verificable", () => {
    expect(crossCheckAllergies([alergia("Penicilinas")], [AMOXICILINA]).unverifiable).toHaveLength(0);
    expect(crossCheckAllergies([alergia("Amoxicilina")], [AMOXICILINA]).unverifiable).toHaveLength(0);
  });

  it("una familia conocida se considera resuelta aunque no coincida con ningún fármaco de la receta", () => {
    const { matches, unverifiable } = crossCheckAllergies([alergia("Penicilinas")], [PARACETAMOL]);
    expect(matches).toHaveLength(0);
    expect(unverifiable).toHaveLength(0);
  });
});
