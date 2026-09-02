import { z } from "zod";

// M2B (spec §7, v2.2): catálogo cerrado, independiente de la
// audiencia (visibility) y del estado (status) de la publicación.
export const POST_CATEGORIES = [
  "HEALTH_EDUCATION",
  "HEALTH_TIP",
  "HEALTH_FACT",
  "PROFESSIONAL_UPDATE",
  "CONGRESS",
  "RESEARCH",
  "CERTIFICATION",
  "PATIENT_NOTICE",
  "PREVENTION",
  "LIFESTYLE",
  "VIDEO",
  "PHOTO",
  "ANNOUNCEMENT",
] as const;
export const postCategorySchema = z.enum(POST_CATEGORIES);
export type PostCategory = z.infer<typeof postCategorySchema>;

// M2B-RN-006: estas categorías siempre llevan el aviso educativo fijo
// en el frontend — un solo lugar que decide cuáles, para que no se le
// olvide agregarlo a un componente nuevo.
export const EDUCATIONAL_POST_CATEGORIES: readonly PostCategory[] = [
  "HEALTH_EDUCATION",
  "HEALTH_TIP",
  "HEALTH_FACT",
  "PREVENTION",
  "LIFESTYLE",
];

// M2B-RN-002: PATIENTS_ONLY se autoriza contra care_relationship,
// siempre en backend.
export const POST_VISIBILITIES = ["PUBLIC", "PATIENTS_ONLY", "PRIVATE"] as const;
export const postVisibilitySchema = z.enum(POST_VISIBILITIES);
export type PostVisibility = z.infer<typeof postVisibilitySchema>;

// M2B-RN-003: draft (solo autor) -> published (según visibility) ->
// archived (fuera de toda vista pública/pacientes).
export const POST_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export const postStatusSchema = z.enum(POST_STATUSES);
export type PostStatus = z.infer<typeof postStatusSchema>;

export const doctorPostCreateSchema = z.object({
  title: z.string().max(200).optional(),
  body: z.string().min(1, "El contenido no puede estar vacío.").max(5000),
  category: postCategorySchema,
  visibility: postVisibilitySchema.default("PRIVATE"),
});
export type DoctorPostCreateInput = z.infer<typeof doctorPostCreateSchema>;

// .strict(): DELETE/PATCH de status pasan por endpoints/campos
// explícitos, no por claves sueltas que este esquema dejaría pasar en
// silencio.
export const doctorPostUpdateSchema = z
  .object({
    title: z.string().max(200).optional(),
    body: z.string().min(1, "El contenido no puede estar vacío.").max(5000).optional(),
    category: postCategorySchema.optional(),
    visibility: postVisibilitySchema.optional(),
    status: postStatusSchema.optional(),
  })
  .strict();
export type DoctorPostUpdateInput = z.infer<typeof doctorPostUpdateSchema>;

// M2B-RN-005: el DB/tipo ya soporta VIDEO (catálogo cerrado), pero el
// tamaño/formato de video queda PENDIENTE(jorge) — el servicio
// rechaza mediaType=VIDEO hasta que se decida, en vez de aceptar un
// archivo que nadie validó.
export const doctorPostMediaUploadMetadataSchema = z.object({
  mediaType: z.enum(["PHOTO", "VIDEO"]),
});
export type DoctorPostMediaUploadMetadataInput = z.infer<typeof doctorPostMediaUploadMetadataSchema>;
