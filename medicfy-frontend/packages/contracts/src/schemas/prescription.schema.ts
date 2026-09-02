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
    // Prompt 32: unidad de dosis explícita e indicación por línea.
    doseUnit: z.string().max(30).optional(),
    indication: z.string().max(200).optional(),
    route: z.string().min(1),
    frequency: z.string().min(1),
    duration: z.string().min(1),
    quantity: z.string().optional(),
    specialInstructions: z.string().optional(),
    // Prompt 36 — procedencia: el cliente declara si la línea vino de
    // "traer última receta" y si la editó; el servidor resuelve la
    // receta/fecha de origen y NO confía en fechas del cliente.
    origin: z.enum(["NUEVA", "HEREDADA", "HEREDADA_MODIFICADA"]).optional(),
    sourcePrescriptionId: z.string().uuid().optional(),
  })
  .strict();
export type PrescriptionItemCreateInput = z.infer<typeof prescriptionItemCreateSchema>;

// M9-RN-002: toda receta pertenece a un encounter. M9-CA-003: si hay
// conflicto de alergia, el servicio exige allergyOverrideConfirmed=true
// para proceder (auditado con el nombre del médico) — no se puede
// forzar sin este campo explícito.
// encounterId va en la URL (POST /prescriptions/encounters/:encounterId),
// no en el body — redundante mandarlo dos veces.
const prescriptionCreateBaseSchema = z.object({
  // El diagnóstico que motiva ESTA receta — texto libre, no depende
  // de que el encuentro ya tenga diagnósticos CIE-10 formales
  // guardados (eso solo ocurre al firmar la nota, M8-RN-006); la
  // receta puede emitirse antes de firmar (panel lateral, CLAUDE.md
  // §6), así que necesita su propio dato aquí.
  diagnosisSnapshot: z.string().min(1, "El diagnóstico es obligatorio."),
  items: z.array(prescriptionItemCreateSchema).min(1, "Se requiere al menos un medicamento.").max(10),
  generalInstructions: z.string().optional(),
  // Prompt 34: el bloqueo por alergia SOLO se libera con una
  // justificación clínica (queda en el expediente, firmada). El viejo
  // boolean allergyOverrideConfirmed desaparece del contrato.
  allergyOverrideJustification: z
    .string()
    .min(15, "Justifica clínicamente (mínimo 15 caracteres) por qué procede a pesar de la alergia registrada.")
    .max(500)
    .optional(),
  // Prompt 35: interacción GRAVE exige confirmación explícita.
  interactionOverrideConfirmed: z.boolean().optional(),
});

// Corrección v2.1 de especificacion-plataforma-clinica-con-ia.md §1:
// "la firma digital no debe ser obligatoria para imprimir una
// receta". Union discriminada por signatureRoute en vez de campos
// opcionales sueltos: la variante autógrafa estructuralmente NO
// puede llevar password/totpCode (ni por error del cliente), no solo
// "no los exige".
export const prescriptionCreateHandwrittenSchema = prescriptionCreateBaseSchema
  .extend({ signatureRoute: z.literal("HANDWRITTEN_AFTER_PRINT") })
  .strict();
export type PrescriptionCreateHandwrittenInput = z.infer<typeof prescriptionCreateHandwrittenSchema>;

export const prescriptionCreateElectronicSchema = prescriptionCreateBaseSchema
  .extend({
    signatureRoute: z.literal("ELECTRONIC"),
    // M9-RN-009: contraseña + TOTP re-ingresados en el momento de
    // firmar — no basta con la sesión abierta (M9-CA-007). Solo
    // aplica a esta ruta.
    password: z.string().min(1, "Confirma tu contraseña para firmar."),
    totpCode: z.string().length(6, "El código de verificación debe tener 6 dígitos."),
  })
  .strict();
export type PrescriptionCreateElectronicInput = z.infer<typeof prescriptionCreateElectronicSchema>;

export const prescriptionCreateSchema = z.discriminatedUnion("signatureRoute", [
  prescriptionCreateHandwrittenSchema,
  prescriptionCreateElectronicSchema,
]);
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

// Autoservicio: un médico agrega al catálogo un medicamento que no
// encontró, directamente desde la receta, sin aprobación de admin
// (decisión explícita del usuario, 2026-09-02). controlGroup es
// OBLIGATORIO y viene de un enum cerrado — nunca texto libre, nunca
// con default — precisamente porque R5 (bloqueo duro de Grupos I/II)
// depende de que este campo siempre exista y sea correcto; el
// servidor deriva isElectronicallyPrescribable de aquí, nunca lo
// acepta del cliente.
export const medicationCatalogSelfServiceCreateSchema = z
  .object({
    genericName: z.string().min(2, "El nombre genérico debe tener al menos 2 caracteres.").max(200),
    brandNames: z.array(z.string().min(1).max(100)).max(10).optional(),
    presentations: z.array(z.object({ label: z.string().min(1).max(100) })).min(1, "Agrega al menos una presentación.").max(10),
    atcCode: z.string().max(10).optional(),
    controlGroup: z.enum(["I", "II", "III", "IV", "V", "VI"]),
  })
  .strict();
export type MedicationCatalogSelfServiceCreateInput = z.infer<typeof medicationCatalogSelfServiceCreateSchema>;
