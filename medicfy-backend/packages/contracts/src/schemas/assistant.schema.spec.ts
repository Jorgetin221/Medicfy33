import { describe, expect, it } from "vitest";
import { assistantReadingSchema } from "./assistant.schema";

// Fase 8 · Prompt 49 (docs/medicfy-58-prompts.md) — "Escribe el
// validador y las pruebas del contrato antes de conectar nada." Este
// archivo es exactamente eso: nada aquí llama a ningún modelo.

function baseMeta() {
  return {
    version_modelo: "claude-sonnet-5",
    version_prompt: "v1",
    pase: "OBJETIVO" as const,
    momento: new Date().toISOString(),
    hash_contexto: "a".repeat(64),
    confianza_global: 0.6,
    por_que_esa_confianza: "Contexto parcial: falta el análisis.",
  };
}

function emptyReading() {
  return {
    meta: baseMeta(),
    resumen: "",
    hallazgos_clave: [],
    banderas_rojas: [],
    diferenciales: [],
    falta_por_preguntar: [],
    falta_por_explorar: [],
    estudios_sugeridos: [],
    plan_sugerido: [],
    no_puedo_saber: [],
    fuentes: [],
  };
}

describe("assistantReadingSchema — contrato de El Segundo Lector", () => {
  it("acepta una lectura con todos los bloques vacíos (obligatorios, pero pueden ir vacíos)", () => {
    const result = assistantReadingSchema.safeParse(emptyReading());
    expect(result.success).toBe(true);
  });

  it("rechaza si falta una clave de nivel superior (p. ej. banderas_rojas)", () => {
    const { banderas_rojas: _omitted, ...withoutBanderas } = emptyReading();
    const result = assistantReadingSchema.safeParse(withoutBanderas);
    expect(result.success).toBe(false);
  });

  it("rechaza una clave desconocida (esquema .strict())", () => {
    const result = assistantReadingSchema.safeParse({ ...emptyReading(), diagnostico_directo: "hipertensión" });
    expect(result.success).toBe(false);
  });

  it("rechaza exactamente un diferencial — nunca un diagnóstico único", () => {
    const reading = {
      ...emptyReading(),
      diferenciales: [
        {
          id: "d1",
          diagnostico: "Faringitis viral",
          codigo_sugerido: null,
          probabilidad_relativa: "alta",
          a_favor: ["Fiebre y dolor faríngeo de 2 días"],
          en_contra: ["Sin adenopatías"],
          que_lo_confirmaria: [],
          que_lo_descartaria: [],
        },
      ],
    };
    const result = assistantReadingSchema.safeParse(reading);
    expect(result.success).toBe(false);
  });

  it("acepta dos o más diferenciales, cada uno con a_favor y en_contra no vacíos", () => {
    const differential = (id: string, diagnostico: string) => ({
      id,
      diagnostico,
      codigo_sugerido: null,
      probabilidad_relativa: "media" as const,
      a_favor: ["algo a favor"],
      en_contra: ["algo en contra"],
      que_lo_confirmaria: [],
      que_lo_descartaria: [],
    });
    const reading = {
      ...emptyReading(),
      diferenciales: [differential("d1", "Faringitis viral"), differential("d2", "Faringitis estreptocócica")],
    };
    expect(assistantReadingSchema.safeParse(reading).success).toBe(true);
  });

  it("rechaza un diferencial con a_favor vacío", () => {
    const reading = {
      ...emptyReading(),
      diferenciales: [
        {
          id: "d1",
          diagnostico: "A",
          codigo_sugerido: null,
          probabilidad_relativa: "baja",
          a_favor: [],
          en_contra: ["x"],
          que_lo_confirmaria: [],
          que_lo_descartaria: [],
        },
        {
          id: "d2",
          diagnostico: "B",
          codigo_sugerido: null,
          probabilidad_relativa: "baja",
          a_favor: ["x"],
          en_contra: ["x"],
          que_lo_confirmaria: [],
          que_lo_descartaria: [],
        },
      ],
    };
    expect(assistantReadingSchema.safeParse(reading).success).toBe(false);
  });

  it("rechaza probabilidad_relativa fuera del enum cualitativo (nunca un porcentaje inventado)", () => {
    const reading = {
      ...emptyReading(),
      diferenciales: [
        {
          id: "d1",
          diagnostico: "A",
          codigo_sugerido: null,
          probabilidad_relativa: "73.2%",
          a_favor: ["x"],
          en_contra: ["x"],
          que_lo_confirmaria: [],
          que_lo_descartaria: [],
        },
        {
          id: "d2",
          diagnostico: "B",
          codigo_sugerido: null,
          probabilidad_relativa: "baja",
          a_favor: ["x"],
          en_contra: ["x"],
          que_lo_confirmaria: [],
          que_lo_descartaria: [],
        },
      ],
    };
    expect(assistantReadingSchema.safeParse(reading).success).toBe(false);
  });

  it("acepta fuente_id null en el plan sugerido — 'sin fuente, el elemento se emite igual'", () => {
    const reading = {
      ...emptyReading(),
      plan_sugerido: [{ id: "p1", intervencion: "Hidratación oral", precaucion: "", fuente_id: null }],
    };
    expect(assistantReadingSchema.safeParse(reading).success).toBe(true);
  });

  it("rechaza un fuente_id que no corresponde a ninguna entrada de fuentes", () => {
    const reading = {
      ...emptyReading(),
      plan_sugerido: [{ id: "p1", intervencion: "Hidratación oral", precaucion: "", fuente_id: "f-inexistente" }],
    };
    expect(assistantReadingSchema.safeParse(reading).success).toBe(false);
  });

  it("acepta un fuente_id que sí corresponde a una fuente real, y exige que fuentes.afirmacion_id apunte a un elemento real", () => {
    const reading = {
      ...emptyReading(),
      plan_sugerido: [{ id: "p1", intervencion: "Hidratación oral", precaucion: "", fuente_id: "f1" }],
      fuentes: [{ id: "f1", afirmacion_id: "p1", fuente: "Guía clínica X", anio: 2024 }],
    };
    expect(assistantReadingSchema.safeParse(reading).success).toBe(true);
  });

  it("rechaza una fuente cuyo afirmacion_id no corresponde a ningún elemento con id de la lectura", () => {
    const reading = {
      ...emptyReading(),
      fuentes: [{ id: "f1", afirmacion_id: "no-existe", fuente: "Guía clínica X", anio: 2024 }],
    };
    expect(assistantReadingSchema.safeParse(reading).success).toBe(false);
  });

  it("acepta banderas_rojas con los tres niveles de urgencia válidos, y rechaza uno inventado", () => {
    const bandera = (urgencia: string) => ({
      id: "b1",
      hallazgo: "Saturación 88%",
      por_que_importa: "Hipoxemia",
      que_hacer: "Confirmar con oximetría y valorar traslado",
      urgencia,
    });
    expect(assistantReadingSchema.safeParse({ ...emptyReading(), banderas_rojas: [bandera("inmediata")] }).success).toBe(true);
    expect(assistantReadingSchema.safeParse({ ...emptyReading(), banderas_rojas: [bandera("misma_consulta")] }).success).toBe(true);
    expect(assistantReadingSchema.safeParse({ ...emptyReading(), banderas_rojas: [bandera("seguimiento")] }).success).toBe(true);
    expect(assistantReadingSchema.safeParse({ ...emptyReading(), banderas_rojas: [bandera("urgente")] }).success).toBe(false);
  });

  it("rechaza meta.confianza_global fuera de [0,1]", () => {
    const reading = { ...emptyReading(), meta: { ...baseMeta(), confianza_global: 1.5 } };
    expect(assistantReadingSchema.safeParse(reading).success).toBe(false);
  });

  it("rechaza meta.pase fuera de los cuatro pases nombrados", () => {
    const reading = { ...emptyReading(), meta: { ...baseMeta(), pase: "QUINTO" } };
    expect(assistantReadingSchema.safeParse(reading).success).toBe(false);
  });
});
