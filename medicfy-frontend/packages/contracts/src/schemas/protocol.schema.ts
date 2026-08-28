import { z } from "zod";

// Fase 7 · Prompt 47 — motor genérico de protocolo longitudinal.
// TreatmentProtocol/TreatmentProtocolSessionTemplate/ProtocolFieldSchema
// son DATOS sembrados (curación), no algo que un médico cree en vivo
// — mismo criterio que ClinicalCatalogTerm/SpecialtyFieldSchema, así
// que solo estas tres acciones necesitan validación de entrada.

export const patientProtocolInstanceStartSchema = z
  .object({
    protocolId: z.string().uuid(),
  })
  .strict();
export type PatientProtocolInstanceStartInput = z.infer<typeof patientProtocolInstanceStartSchema>;

// Motivo LITERAL del prompt 47 — no se inventa ninguno adicional.
export const PROTOCOL_INSTANCE_CLOSURE_REASONS = ["COMPLETADO", "ABANDONADO", "CAMBIO_PLAN", "REFERIDO"] as const;
export const patientProtocolInstanceCloseSchema = z
  .object({
    closureReason: z.enum(PROTOCOL_INSTANCE_CLOSURE_REASONS),
    closureNotes: z.string().max(1000).optional(),
  })
  .strict();
export type PatientProtocolInstanceCloseInput = z.infer<typeof patientProtocolInstanceCloseSchema>;

// "Una sesión fuera de ventana se REGISTRA como tal, no se rechaza"
// (prompt 47) — este schema nunca valida la fecha contra la ventana;
// eso lo calcula el servidor y se guarda en withinWindow, informativo.
export const protocolSessionRecordSchema = z
  .object({
    actualDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida — usa AAAA-MM-DD."),
    encounterId: z.string().uuid().optional(),
    data: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
  })
  .strict();
export type ProtocolSessionRecordInput = z.infer<typeof protocolSessionRecordSchema>;
