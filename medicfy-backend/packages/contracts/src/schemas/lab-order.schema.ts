import { z } from "zod";

// Prompt 37A: el estudio viene del CATÁLOGO en dos niveles (el tipo
// filtra los concretos) y el motivo es OBLIGATORIO y de catálogo
// cerrado — "no existe la opción de dejarlo vacío". studyName ya no
// viaja del cliente: se resuelve del término en el servidor.
export const labOrderItemCreateSchema = z
  .object({
    studyKey: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/),
    motiveKey: z.string().min(1, "El motivo de solicitud es obligatorio.").max(100).regex(/^[a-z0-9_]+$/),
    notes: z.string().max(500).optional(),
  })
  .strict();
export type LabOrderItemCreateInput = z.infer<typeof labOrderItemCreateSchema>;

// encounterId va en la URL (POST /lab-orders/encounters/:encounterId).
const labOrderCreateBaseSchema = z.object({
  items: z.array(labOrderItemCreateSchema).min(1, "Se requiere al menos un estudio."),
  clinicalIndication: z.string().min(1, "La indicación clínica es obligatoria."),
  fastingRequired: z.boolean().optional(),
});

// A diferencia de recetas (M9-RN-009), ninguna regla M10 exige
// contraseña+TOTP — la firma electrónica es opcional. Misma forma de
// dos rutas ya usada en prescriptionCreateSchema.
export const labOrderCreateHandwrittenSchema = labOrderCreateBaseSchema
  .extend({ signatureRoute: z.literal("HANDWRITTEN_AFTER_PRINT") })
  .strict();
export type LabOrderCreateHandwrittenInput = z.infer<typeof labOrderCreateHandwrittenSchema>;

export const labOrderCreateElectronicSchema = labOrderCreateBaseSchema
  .extend({
    signatureRoute: z.literal("ELECTRONIC"),
    password: z.string().min(1, "Confirma tu contraseña para firmar."),
    totpCode: z.string().length(6, "El código de verificación debe tener 6 dígitos."),
  })
  .strict();
export type LabOrderCreateElectronicInput = z.infer<typeof labOrderCreateElectronicSchema>;

export const labOrderCreateSchema = z.discriminatedUnion("signatureRoute", [
  labOrderCreateHandwrittenSchema,
  labOrderCreateElectronicSchema,
]);
export type LabOrderCreateInput = z.infer<typeof labOrderCreateSchema>;

export const labOrderCancelSchema = z
  .object({
    reason: z.string().min(1, "El motivo de cancelación es obligatorio."),
  })
  .strict();
export type LabOrderCancelInput = z.infer<typeof labOrderCancelSchema>;

// v1.0 (§6.7): sube el médico o el paciente. labOrderId es opcional —
// un resultado puede subirse sin orden previa (estudio externo que el
// paciente ya se hizo).
export const labResultUploadMetadataSchema = z
  .object({
    labOrderId: z.string().uuid().optional(),
    labName: z.string().optional(),
    resultDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();
export type LabResultUploadMetadataInput = z.infer<typeof labResultUploadMetadataSchema>;

export const labResultReviewSchema = z
  .object({
    doctorComment: z.string().min(1),
  })
  .strict();
export type LabResultReviewInput = z.infer<typeof labResultReviewSchema>;

// Fase 5 · Prompt 42A: analito ESTRUCTURADO — nombre, valor, unidad,
// rango de referencia. loincCode opcional (M10-RN-005: sin catálogo
// LOINC completo en el MVP). Captura manual del médico, no OCR.
export const labResultAnalyteCreateSchema = z
  .object({
    labOrderId: z.string().uuid().optional(),
    analyteName: z.string().min(1, "El nombre del analito es obligatorio.").max(200),
    loincCode: z.string().max(20).optional(),
    value: z.number(),
    unit: z.string().min(1, "La unidad es obligatoria.").max(50),
    referenceMin: z.number().optional(),
    referenceMax: z.number().optional(),
    measuredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida — usa AAAA-MM-DD."),
  })
  .strict();
export type LabResultAnalyteCreateInput = z.infer<typeof labResultAnalyteCreateSchema>;
