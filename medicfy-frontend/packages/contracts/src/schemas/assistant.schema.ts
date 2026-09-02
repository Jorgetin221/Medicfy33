import { z } from "zod";

// Fase 8 · Prompt 49 — "El Segundo Lector" (docs/medicfy-58-prompts.md,
// Bloque 9). Contrato de salida del asistente clínico: nunca prosa,
// siempre este objeto. "Todos obligatorios aunque vayan vacíos" — cada
// bloque SIEMPRE está presente en la respuesta (nunca se omite una
// clave), aunque su contenido sea un arreglo o string vacío. Esto es
// lo único de la Fase 8 que se construye ANTES de conectar ningún
// modelo — el prompt lo pide explícitamente: "Escribe el validador y
// las pruebas del contrato antes de conectar nada."

export const ASSISTANT_PASSES = ["SUBJETIVO", "OBJETIVO", "ANALISIS", "CIERRE"] as const;
export const assistantPassSchema = z.enum(ASSISTANT_PASSES);
export type AssistantPass = z.infer<typeof assistantPassSchema>;

// Fase 8 · Prompt 51 — cuerpo de POST .../assistant/passes.
export const assistantPassRequestSchema = z.object({ pase: assistantPassSchema }).strict();
export type AssistantPassRequestInput = z.infer<typeof assistantPassRequestSchema>;

export const URGENCY_LEVELS = ["inmediata", "misma_consulta", "seguimiento"] as const;

// "probabilidad_relativa": deliberadamente cualitativa (alta/media/
// baja), nunca un porcentaje — un número como "73.2%" sería precisión
// clínica inventada que ningún modelo puede respaldar honestamente.
export const RELATIVE_PROBABILITY_LEVELS = ["alta", "media", "baja"] as const;

const idSchema = z.string().min(1);

const hallazgoClaveSchema = z.object({
  id: idSchema,
  dato: z.string(),
  de_donde: z.string(),
});

const banderaRojaSchema = z.object({
  id: idSchema,
  hallazgo: z.string(),
  por_que_importa: z.string(),
  que_hacer: z.string(),
  urgencia: z.enum(URGENCY_LEVELS),
});

// "Nunca un diagnóstico único... siempre con a favor y en contra": se
// aplica por elemento (a_favor/en_contra no vacíos) — ver la regla a
// nivel de arreglo más abajo (0, o 2+, nunca exactamente 1).
const diferencialSchema = z.object({
  id: idSchema,
  diagnostico: z.string(),
  codigo_sugerido: z.string().nullable(),
  probabilidad_relativa: z.enum(RELATIVE_PROBABILITY_LEVELS),
  a_favor: z.array(z.string()).min(1),
  en_contra: z.array(z.string()).min(1),
  que_lo_confirmaria: z.array(z.string()),
  que_lo_descartaria: z.array(z.string()),
});

const preguntaPendienteSchema = z.object({
  id: idSchema,
  pregunta: z.string(),
  para_que: z.string(),
});

const maniobraPendienteSchema = z.object({
  id: idSchema,
  maniobra: z.string(),
  para_que: z.string(),
});

const estudioSugeridoSchema = z.object({
  id: idSchema,
  estudio: z.string(),
  para_que: z.string(),
  cambia_la_conducta_si: z.string(),
});

const fuenteSchema = z.object({
  id: idSchema,
  afirmacion_id: z.string(),
  fuente: z.string(),
  anio: z.number().int().min(1900).max(2100),
});

// "Toda afirmación del plan lleva fuente_id. Sin fuente, el elemento
// se emite igual pero la interfaz lo marca como sin respaldo
// verificable" — por eso fuente_id es nullable, no requerido: la
// degradación visual es responsabilidad del frontend, no del
// validador.
const intervencionPlanSchema = z.object({
  id: idSchema,
  intervencion: z.string(),
  precaucion: z.string(),
  fuente_id: z.string().nullable(),
});

const assistantReadingMetaSchema = z.object({
  version_modelo: z.string().min(1),
  version_prompt: z.string().min(1),
  pase: assistantPassSchema,
  momento: z.string().datetime(),
  hash_contexto: z.string().min(1),
  confianza_global: z.number().min(0).max(1),
  por_que_esa_confianza: z.string(),
});

// Campos compartidos por las dos formas del contrato: lo que el
// SERVIDOR entrega completo (assistantReadingSchema, con meta) y lo
// que se le exige al MODELO por tool-use (assistantModelOutputSchema,
// sin meta — Fase 8 · Prompt 51). version_modelo/version_prompt/pase/
// momento/hash_contexto los fija el servidor, nunca el modelo: no
// puede saber su propio identificador de versión con certeza, ni
// calcular el hash del contexto que él mismo recibió.
const substantiveReadingFields = {
  resumen: z.string(),
  hallazgos_clave: z.array(hallazgoClaveSchema),
  banderas_rojas: z.array(banderaRojaSchema),
  diferenciales: z.array(diferencialSchema),
  falta_por_preguntar: z.array(preguntaPendienteSchema),
  falta_por_explorar: z.array(maniobraPendienteSchema),
  estudios_sugeridos: z.array(estudioSugeridoSchema),
  plan_sugerido: z.array(intervencionPlanSchema),
  no_puedo_saber: z.array(z.string()),
  fuentes: z.array(fuenteSchema),
};

interface SubstantiveReadingData {
  hallazgos_clave: { id: string }[];
  banderas_rojas: { id: string }[];
  diferenciales: { id: string }[];
  falta_por_preguntar: { id: string }[];
  falta_por_explorar: { id: string }[];
  estudios_sugeridos: { id: string }[];
  plan_sugerido: { id: string; fuente_id: string | null }[];
  fuentes: { id: string; afirmacion_id: string }[];
}

function checkSubstantiveInvariants(data: SubstantiveReadingData, ctx: z.RefinementCtx): void {
  // "Nunca un diagnóstico único: mínimo dos diferenciales" — 0 está
  // permitido (p. ej. en el Pase 1, antes de que haya información
  // suficiente para sugerir ninguno), pero exactamente 1 no.
  if (data.diferenciales.length === 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Nunca se sugiere un solo diferencial: 0, o al menos 2.",
      path: ["diferenciales"],
    });
  }

  // Integridad referencial simple: todo id usado como afirmacion_id o
  // fuente_id (cuando no es null) debe existir realmente en
  // `fuentes`, para que "sin respaldo verificable" en el frontend
  // signifique algo — nunca un id que apunta a nada.
  const fuenteIds = new Set(data.fuentes.map((f) => f.id));
  data.plan_sugerido.forEach((item, index) => {
    if (item.fuente_id !== null && !fuenteIds.has(item.fuente_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `fuente_id "${item.fuente_id}" no corresponde a ninguna entrada de fuentes.`,
        path: ["plan_sugerido", index, "fuente_id"],
      });
    }
  });
  data.fuentes.forEach((fuente, index) => {
    const allIds = new Set([
      ...data.hallazgos_clave.map((h) => h.id),
      ...data.banderas_rojas.map((b) => b.id),
      ...data.diferenciales.map((d) => d.id),
      ...data.falta_por_preguntar.map((p) => p.id),
      ...data.falta_por_explorar.map((m) => m.id),
      ...data.estudios_sugeridos.map((e) => e.id),
      ...data.plan_sugerido.map((p) => p.id),
    ]);
    if (!allIds.has(fuente.afirmacion_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `afirmacion_id "${fuente.afirmacion_id}" no corresponde a ningún elemento con id en la lectura.`,
        path: ["fuentes", index, "afirmacion_id"],
      });
    }
  });
}

export const assistantReadingSchema = z
  .object({ meta: assistantReadingMetaSchema, ...substantiveReadingFields })
  .strict()
  .superRefine(checkSubstantiveInvariants);
export type AssistantReading = z.infer<typeof assistantReadingSchema>;

// Fase 8 · Prompt 51 — lo que se le exige al modelo por tool-use: todo
// el contrato MENOS meta, más su propia autoevaluación de confianza
// (eso sí es juicio del modelo, no algo que el servidor pueda calcular
// por él).
export const assistantModelOutputSchema = z
  .object({
    confianza_global: z.number().min(0).max(1),
    por_que_esa_confianza: z.string(),
    ...substantiveReadingFields,
  })
  .strict()
  .superRefine(checkSubstantiveInvariants);
export type AssistantModelOutput = z.infer<typeof assistantModelOutputSchema>;
