import { z } from "zod";

// M8 "Validaciones" (spec §7 M8): rangos de plausibilidad exactos —
// un valor fuera de rango no se rechaza aquí (puede ser real y ser
// una urgencia, M8-RN-007), se confirma explícitamente en el
// servicio. Este schema solo rechaza valores fisiológicamente
// imposibles (fuera del rango absoluto), no clínicamente inusuales.
export const vitalsSchema = z
  .object({
    bpSystolic: z.number().min(40).max(300).optional(),
    bpDiastolic: z.number().min(20).max(200).optional(),
    heartRate: z.number().min(20).max(250).optional(),
    respiratoryRate: z.number().min(5).max(60).optional(),
    tempC: z.number().min(30).max(43).optional(),
    spo2: z.number().min(50).max(100).optional(),
    weightKg: z.number().min(0.5).max(400).optional(),
    heightCm: z.number().min(20).max(250).optional(),
  })
  .strict();
export type VitalsInput = z.infer<typeof vitalsSchema>;

export const encounterTypeSchema = z.enum(["FIRST_VISIT", "FOLLOW_UP", "TELECONSULTATION", "URGENT"]);

export const clinicalEncounterCreateSchema = z
  .object({
    patientId: z.string().uuid(),
    appointmentId: z.string().uuid().optional(),
    encounterType: encounterTypeSchema,
  })
  .strict();
export type ClinicalEncounterCreateInput = z.infer<typeof clinicalEncounterCreateSchema>;

// M8-RN-002: el draft se autoguarda cada 10s, editable libremente —
// todos los campos opcionales aquí. La validación completa (obligatoria
// para poder firmar) vive en clinicalNoteSignSchema.
export const clinicalNoteDraftUpdateSchema = z
  .object({
    chiefComplaint: z.string().max(500).optional(),
    currentIllness: z.string().optional(),
    vitals: vitalsSchema.optional(),
    physicalExam: z.string().optional(),
    assessment: z.string().optional(),
    plan: z.string().optional(),
    prognosis: z.string().optional(),
  })
  .strict();
export type ClinicalNoteDraftUpdateInput = z.infer<typeof clinicalNoteDraftUpdateSchema>;

export const encounterDiagnosisSchema = z
  .object({
    icd10Code: z.string().min(1).max(10),
    description: z.string().min(1),
    diagnosisType: z.enum(["PRINCIPAL", "SECONDARY"]),
    certainty: z.enum(["SUSPECTED", "CONFIRMED"]),
  })
  .strict();
export type EncounterDiagnosisInput = z.infer<typeof encounterDiagnosisSchema>;

// M8 "Validaciones": motivo 3-500 caracteres obligatorio, padecimiento
// obligatorio, al menos un diagnóstico con CIE-10 (M8-RN-006). Esta es
// la forma completa exigida al firmar (M8-CA-006 depende de que las
// alergias ya estén conciliadas, verificado en el servicio, no aquí).
export const clinicalNoteSignSchema = z
  .object({
    chiefComplaint: z.string().min(3, "El motivo de consulta debe tener al menos 3 caracteres.").max(500),
    currentIllness: z.string().min(1, "El padecimiento actual es obligatorio."),
    vitals: vitalsSchema,
    physicalExam: z.string().optional(),
    assessment: z.string().min(1, "El análisis es obligatorio."),
    plan: z.string().min(1, "El plan es obligatorio."),
    prognosis: z.string().optional(),
    diagnoses: z.array(encounterDiagnosisSchema).min(1, "Se requiere al menos un diagnóstico con código CIE-10."),
  })
  .strict();
export type ClinicalNoteSignInput = z.infer<typeof clinicalNoteSignSchema>;

// Corrección de una nota firmada (M8-RN-001): nunca UPDATE, siempre
// una nota nueva referenciando la original.
export const clinicalNoteCorrectionSchema = clinicalNoteSignSchema.extend({
  isCorrectionOfNoteId: z.string().uuid(),
});
export type ClinicalNoteCorrectionInput = z.infer<typeof clinicalNoteCorrectionSchema>;

export const patientAllergyCreateSchema = z
  .object({
    substance: z.string().min(1),
    allergyType: z.string().min(1),
    reaction: z.string().optional(),
    severity: z.string().min(1),
    ageOfOnset: z.string().optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "RULED_OUT"]).optional(),
    certainty: z.enum(["CONFIRMED", "LIKELY", "UNCERTAIN"]),
    source: z.string().min(1),
  })
  .strict();
export type PatientAllergyCreateInput = z.infer<typeof patientAllergyCreateSchema>;

export const patientAllergyUpdateSchema = patientAllergyCreateSchema.partial().strict();
export type PatientAllergyUpdateInput = z.infer<typeof patientAllergyUpdateSchema>;

export const patientMedicationCreateSchema = z
  .object({
    genericName: z.string().min(1),
    brandName: z.string().optional(),
    dose: z.string().min(1),
    route: z.string().min(1),
    frequency: z.string().min(1),
    startedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    suspendedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    reason: z.string().optional(),
    status: z.enum(["ACTIVE", "SUSPENDED", "COMPLETED"]).optional(),
    prescriber: z.string().optional(),
    source: z.string().min(1),
  })
  .strict();
export type PatientMedicationCreateInput = z.infer<typeof patientMedicationCreateSchema>;

export const patientMedicationUpdateSchema = patientMedicationCreateSchema.partial().strict();
export type PatientMedicationUpdateInput = z.infer<typeof patientMedicationUpdateSchema>;

export const clinicalAttachmentUploadMetadataSchema = z
  .object({
    encounterId: z.string().uuid().optional(),
    category: z.enum(["LAB_RESULT", "IMAGING", "EXTERNAL_DOCUMENT", "PHOTO", "OTHER"]),
    description: z.string().optional(),
  })
  .strict();
export type ClinicalAttachmentUploadMetadataInput = z.infer<typeof clinicalAttachmentUploadMetadataSchema>;

// Catálogo público CIE-10 (OMS/DOF) — búsqueda de solo lectura para
// el selector de diagnóstico de DOC-06. Sin CareRelationshipGuard:
// no es un dato de un paciente específico.
export const icd10SearchQuerySchema = z
  .object({
    search: z.string().trim().max(100).optional(),
  })
  .strict();
export type Icd10SearchQueryInput = z.infer<typeof icd10SearchQuerySchema>;

// M8-RN-013/§6: "plantillas insertables por atajo de teclado" — el
// contenido siempre lo escribe el médico (nunca texto clínico
// pre-cargado por nosotros, CLAUDE.md §7). shortcutKey es un dígito
// 1-9 para Alt+<n> en DOC-06; opcional porque no toda plantilla
// necesita un atajo dedicado.
export const noteTemplateCreateSchema = z
  .object({
    label: z.string().min(1, "Ponle un nombre a la plantilla.").max(60),
    content: z.string().min(1, "La plantilla no puede estar vacía.").max(2000),
    shortcutKey: z.string().regex(/^[1-9]$/, "Debe ser un dígito del 1 al 9.").optional(),
  })
  .strict();
export type NoteTemplateCreateInput = z.infer<typeof noteTemplateCreateSchema>;
