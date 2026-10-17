import { describe, expect, it } from "vitest";
import { LAB_STUDIES, LAB_STUDY_MOTIVES, LAB_STUDY_TYPES } from "./lab-studies";
import { labOrderItemCreateSchema } from "../schemas/lab-order.schema";

describe("catálogo de estudios", () => {
  it("claves únicas y válidas para el contrato", () => {
    const keys = LAB_STUDIES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z0-9_]+$/);
  });

  it("conserva las claves de órdenes ya emitidas", () => {
    const keys = new Set(LAB_STUDIES.map((s) => s.key));
    for (const key of ["bh", "qs6", "ego", "perfil_lipidico", "hba1c", "tsh", "tele_torax", "usg_abdominal", "ecg"]) {
      expect(keys.has(key)).toBe(true);
    }
  });

  it("cada estudio pertenece a un tipo existente", () => {
    const tipos = new Set(LAB_STUDY_TYPES.map((t) => t.key));
    for (const study of LAB_STUDIES) expect(tipos.has(study.tipo)).toBe(true);
    expect(LAB_STUDY_MOTIVES.length).toBeGreaterThan(0);
  });
});

describe("labOrderItemCreateSchema", () => {
  it("acepta un estudio de catálogo o uno escrito por el médico", () => {
    expect(labOrderItemCreateSchema.safeParse({ studyKey: "bh", motiveKey: "tamizaje" }).success).toBe(true);
    expect(labOrderItemCreateSchema.safeParse({ customStudyName: "Panel de alérgenos alimentarios", motiveKey: "diagnostico_inicial" }).success).toBe(true);
  });

  it("rechaza ninguno, ambos o un nombre demasiado corto", () => {
    expect(labOrderItemCreateSchema.safeParse({ motiveKey: "tamizaje" }).success).toBe(false);
    expect(labOrderItemCreateSchema.safeParse({ studyKey: "bh", customStudyName: "Otro", motiveKey: "tamizaje" }).success).toBe(false);
    expect(labOrderItemCreateSchema.safeParse({ customStudyName: "  a ", motiveKey: "tamizaje" }).success).toBe(false);
  });
});
