import { z } from "zod";

// Prompt 9 / P4 §6: la lista de dominios de catálogo es CERRADA en el
// contrato (z.enum), aunque la columna siga siendo String en Postgres:
// así agregar un dominio nuevo es un cambio de código revisable (este
// archivo) y no una migración, pero ningún cliente puede inventarse
// un dominio por la API. Los seis dominios iniciales salen de la
// auditoría P4 (los vocabularios de facto de mayor riesgo):
//   ALERGIA_AGENTE      — agentes alérgenos (P4 §2.1, crítico)
//   ESTUDIO_LABORATORIO — estudios de laboratorio (P4 §2.2, crítico)
//   LABORATORIO_CLINICO — laboratorios receptores (P4 §2.9)
//   VIA_ADMINISTRACION  — vías de administración (P4 §2.8)
//   FRECUENCIA_DOSIS    — frecuencias de dosificación (P4 §2.8)
//   ANTECEDENTE         — complementos del vocabulario de antecedentes
//                         (el enum de 30 subtipos sigue siendo la
//                         fuente primaria; aquí viven términos curados
//                         como el clúster de respuestas negativas)
// Prompt 9 amplía la lista: sustancias psicoactivas (lista tipo NIDA),
// tipos de nota y documento, y los administrativos con fuente oficial
// (entidades INEGI, estados civiles). Ocupaciones (SINCO es enorme),
// aseguradoras y los estudios en dos niveles + motivos quedan
// DIFERIDOS y declarados en el ESTADO — sin fuente estándar razonable
// a la mano, se dice en lugar de inventarla.
export const CATALOG_DOMAINS = [
  "ALERGIA_AGENTE",
  "ESTUDIO_LABORATORIO",
  "LABORATORIO_CLINICO",
  "VIA_ADMINISTRACION",
  "FRECUENCIA_DOSIS",
  "ANTECEDENTE",
  "SUSTANCIA_PSICOACTIVA",
  "ENTIDAD_FEDERATIVA",
  "ESTADO_CIVIL",
  "TIPO_NOTA",
  "TIPO_DOCUMENTO",
  "TIPO_ESTUDIO",
  "MOTIVO_ESTUDIO",
] as const;
export const catalogDomainSchema = z.enum(CATALOG_DOMAINS);
export type CatalogDomain = z.infer<typeof catalogDomainSchema>;

// Prompt 7 (medicfy-50-prompts.md), "los catálogos son cerrados":
// "todo catálogo declara su sistema de codificación externo o queda
// documentado explícitamente como propietario" — codingSystem nunca es
// opcional aquí; si no hay sistema externo, el valor explícito es
// "PROPIETARIO", no un campo vacío u omitido.
//
// Prompt 10: curatedBy YA NO viaja en el cuerpo — el servidor lo fija
// con el usuario autenticado que ejecuta el alta (rol CURATOR). Un
// término no puede nacer atribuido a otra persona.
export const clinicalCatalogTermCreateSchema = z
  .object({
    domain: catalogDomainSchema,
    key: z.string().min(1).max(100),
    preferredTerm: z.string().min(1).max(200),
    synonyms: z.array(z.string().min(1).max(200)).max(50).optional(),
    externalCode: z.string().min(1).max(60).optional(),
    codingSystem: z.string().min(1, "Declara el sistema de codificación externo, o \"PROPIETARIO\" si no tiene uno.").max(60),
  })
  .strict();
export type ClinicalCatalogTermCreateInput = z.infer<typeof clinicalCatalogTermCreateSchema>;

// GET /catalogs/:domain — búsqueda para selectores de captura.
export const catalogSearchQuerySchema = z
  .object({
    search: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export type CatalogSearchQuery = z.infer<typeof catalogSearchQuerySchema>;

// POST /catalogs/terms/:id/merge
export const catalogMergeSchema = z
  .object({
    intoTermId: z.string().uuid(),
  })
  .strict();
export type CatalogMergeInput = z.infer<typeof catalogMergeSchema>;

// Prompt 10: lo ÚNICO que un médico puede crear rumbo al catálogo es
// una solicitud — la bandeja del curador decide.
export const catalogTermRequestCreateSchema = z
  .object({
    proposedTerm: z.string().min(2).max(200),
    justification: z.string().max(500).optional(),
  })
  .strict();
export type CatalogTermRequestCreateInput = z.infer<typeof catalogTermRequestCreateSchema>;

export const catalogTermRequestResolveSchema = z
  .object({
    resolutionNote: z.string().max(500).optional(),
    // Solo para la resolución "merge": el término vigente al que se
    // mapea la solicitud.
    mergeIntoTermId: z.string().uuid().optional(),
    // Solo para "approve": clave y sistema de codificación del término
    // nuevo; sinónimos opcionales (el término propuesto viaja en la
    // solicitud misma).
    key: z.string().min(1).max(100).optional(),
    codingSystem: z.string().min(1).max(60).optional(),
    synonyms: z.array(z.string().min(1).max(200)).max(50).optional(),
  })
  .strict();
export type CatalogTermRequestResolveInput = z.infer<typeof catalogTermRequestResolveSchema>;
