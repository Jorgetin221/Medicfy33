import { z } from "zod";

// M9-RN-003/art. 33 RIS: denominación genérica obligatoria por ley.
// medicationCatalogId es OBLIGATORIO aquí — no soportamos captura
// manual de medicamento libre todavía (spec §"Casos límite" sí la
// contempla, "marcado para curación por admin", pero eso implicaría
// que el médico declare el controlGroup a mano y R5 es un bloqueo
// duro que no puede depender de que alguien lo escriba bien. genericName/
// brandName/presentation/controlGroup se resuelven SIEMPRE del
// catálogo en el servicio, nunca de lo que mande el cliente — solo
// dose/route/frequency/duration/quantity/instrucciones son decisión
// del médico para este paciente.
export const prescriptionItemCreateSchema = z
  .object({
    medicationCatalogId: z.string().uuid(),
    dose: z.string().min(1),
    route: z.string().min(1),
    frequency: z.string().min(1),
    duration: z.string().min(1),
    quantity: z.string().optional(),
    specialInstructions: z.string().optional(),
  })
  .strict();
export type PrescriptionItemCreateInput = z.infer<typeof prescriptionItemCreateSchema>;

// M9-RN-002: toda receta pertenece a un encounter. M9-CA-003: si hay
// conflicto de alergia, el servicio exige allergyOverrideConfirmed=true
// para proceder (auditado con el nombre del médico) — no se puede
// forzar sin este campo explícito.
// encounterId va en la URL (POST /prescriptions/encounters/:encounterId),
// no en el body — redundante mandarlo dos veces.
export const prescriptionCreateSchema = z
  .object({
    // El diagnóstico que motiva ESTA receta — texto libre, no depende
    // de que el encuentro ya tenga diagnósticos CIE-10 formales
    // guardados (eso solo ocurre al firmar la nota, M8-RN-006); la
    // receta puede emitirse antes de firmar (panel lateral, CLAUDE.md
    // §6), así que necesita su propio dato aquí.
    diagnosisSnapshot: z.string().min(1, "El diagnóstico es obligatorio."),
    items: z.array(prescriptionItemCreateSchema).min(1, "Se requiere al menos un medicamento.").max(10),
    generalInstructions: z.string().optional(),
    allergyOverrideConfirmed: z.boolean().optional(),
    // M9-RN-009: contraseña + TOTP re-ingresados en el momento de
    // firmar — no basta con la sesión abierta (M9-CA-007).
    password: z.string().min(1, "Confirma tu contraseña para firmar."),
    totpCode: z.string().length(6, "El código de verificación debe tener 6 dígitos."),
  })
  .strict();
export type PrescriptionCreateInput = z.infer<typeof prescriptionCreateSchema>;

export const prescriptionCancelSchema = z
  .object({
    reason: z.string().min(1, "El motivo de cancelación es obligatorio."),
  })
  .strict();
export type PrescriptionCancelInput = z.infer<typeof prescriptionCancelSchema>;

// M9-RN-014: registro de receta emitida en recetario físico
// (Grupos I/II) — sin PDF, sin QR, sin pretensión de validez
// electrónica. El folio es el del recetario oficial COFEPRIS del
// médico, no uno generado por Medicfy.
export const externalPhysicalPrescriptionCreateSchema = z
  .object({
    physicalFolio: z.string().min(1, "El folio del recetario físico es obligatorio."),
    genericName: z.string().min(1),
    controlGroup: z.enum(["I", "II"]),
    dose: z.string().min(1),
    route: z.string().min(1),
    frequency: z.string().min(1),
    duration: z.string().min(1),
  })
  .strict();
export type ExternalPhysicalPrescriptionCreateInput = z.infer<typeof externalPhysicalPrescriptionCreateSchema>;

// Catálogo de medicamentos — búsqueda de solo lectura para el panel
// de receta de DOC-06. Sin CareRelationshipGuard: no es un dato de
// un paciente específico (igual que icd10SearchQuerySchema).
export const medicationSearchQuerySchema = z
  .object({
    search: z.string().trim().max(100).optional(),
  })
  .strict();
export type MedicationSearchQueryInput = z.infer<typeof medicationSearchQuerySchema>;
