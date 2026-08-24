import { z } from "zod";

export const labOrderItemCreateSchema = z
  .object({
    studyName: z.string().min(1),
    loincCode: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();
export type LabOrderItemCreateInput = z.infer<typeof labOrderItemCreateSchema>;

// encounterId va en la URL (POST /lab-orders/encounters/:encounterId).
export const labOrderCreateSchema = z
  .object({
    items: z.array(labOrderItemCreateSchema).min(1, "Se requiere al menos un estudio."),
    clinicalIndication: z.string().min(1, "La indicación clínica es obligatoria."),
    fastingRequired: z.boolean().optional(),
    password: z.string().min(1, "Confirma tu contraseña para firmar."),
    totpCode: z.string().length(6, "El código de verificación debe tener 6 dígitos."),
  })
  .strict();
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
