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
    // Prompt 26: perímetros cefálico y abdominal, con unidad explícita.
    headCircumferenceCm: z.number().min(20).max(70).optional(),
    abdominalCircumferenceCm: z.number().min(20).max(250).optional(),
    // Prompt 27/31.2: si el cliente manda un valor CALCULADO, el
    // servidor lo IGNORA y recalcula — se aceptan aquí solo para poder
    // ignorarlos explícitamente (antes .strict() los rechazaba con
    // 400; la letra pide ignorar).
    bmi: z.number().optional(),
    bsaM2: z.number().optional(),
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
    // Motor de escalas (SpecialtyFieldSchema/EncounterSpecialtyData,
    // sección ESCALAS): fieldKey -> valor numérico crudo, tal como el
    // médico lo captura. El cómputo/interpretación nunca viaja desde
    // el cliente — el servidor los recalcula siempre.
    specialtyData: z.record(z.string(), z.number()).optional(),
    physicalExam: z.string().optional(),
    assessment: z.string().optional(),
    plan: z.string().optional(),
    prognosis: z.string().optional(),
  })
  .strict();
export type ClinicalNoteDraftUpdateInput = z.infer<typeof clinicalNoteDraftUpdateSchema>;

// M8-RN-006 exige código CIE-10 para el diagnóstico principal; "texto
// libre permitido como complemento, nunca como sustituto". A petición
// explícita del usuario (2026-08-24, confirmó apartarse de la regla a
// sabiendas tras ofrecerle la alternativa que sí la cumple —
// códigos CIE-10 de síntoma/causa no especificada, capítulo R00-R99),
// existe una segunda ruta: sin icd10Code, pero con codeAbsentReason
// obligatorio como justificación auditable. Exactamente uno de los
// dos, nunca ambos ni ninguno.
export const encounterDiagnosisSchema = z
  .object({
    icd10Code: z.string().min(1).max(10).optional(),
    codeAbsentReason: z.string().min(10, "Explica en al menos 10 caracteres por qué no hay código CIE-10.").max(500).optional(),
    // P4 §6.2: tope explícito — era el único campo clínico sin .max(),
    // y el sitio natural donde acabaría pegado un párrafo narrativo.
    description: z.string().min(1).max(500),
    diagnosisType: z.enum(["PRINCIPAL", "SECONDARY"]),
    certainty: z.enum(["SUSPECTED", "CONFIRMED"]),
  })
  .strict()
  .refine((d) => (d.icd10Code !== undefined) !== (d.codeAbsentReason !== undefined), {
    message: "Cada diagnóstico necesita exactamente uno: un código CIE-10 o una razón de por qué no lo tiene.",
    path: ["icd10Code"],
  });
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
    specialtyData: z.record(z.string(), z.number()).optional(),
    physicalExam: z.string().optional(),
    assessment: z.string().min(1, "El análisis es obligatorio."),
    plan: z.string().min(1, "El plan es obligatorio."),
    prognosis: z.string().optional(),
    diagnoses: z.array(encounterDiagnosisSchema).min(1, "Se requiere al menos un diagnóstico con código CIE-10."),
    // Prompt 26: un signo vital en rango CRÍTICO exige confirmación
    // explícita del médico antes de permitir guardar/firmar.
    criticalVitalsConfirmed: z.boolean().optional(),
  })
  .strict();
export type ClinicalNoteSignInput = z.infer<typeof clinicalNoteSignSchema>;

// Corrección de una nota firmada (M8-RN-001): nunca UPDATE, siempre
// una nota nueva referenciando la original.
export const clinicalNoteCorrectionSchema = clinicalNoteSignSchema.extend({
  isCorrectionOfNoteId: z.string().uuid(),
});
export type ClinicalNoteCorrectionInput = z.infer<typeof clinicalNoteCorrectionSchema>;

// P4 §6.1 (Fase 0): los vocabularios que ya se sabían cerrados dejan
// de ser texto libre. Las listas salen de la propia auditoría (P4
// §2.7-2.8) y de los hint de los formularios que ya las contenían como
// sugerencia. DECISIÓN DELEGADA (Jorge, "aplicar recomendaciones
// viables como decisiones tomadas") — los valores exactos quedan
// sujetos a su revisión clínica.
export const ALLERGY_TYPES = ["MEDICAMENTO", "ALIMENTO", "AMBIENTAL", "PICADURA", "LATEX", "CONTRASTE", "OTRO"] as const;
export const ALLERGY_SEVERITIES = ["LEVE", "MODERADA", "GRAVE"] as const;
export const CLINICAL_DATA_SOURCES = ["PACIENTE", "FAMILIAR", "EXPEDIENTE_PREVIO", "MEDICO"] as const;
// P4 §2.8: "route es un catálogo cerrado en cualquier estándar del
// mundo" — la lista es la de la propia auditoría.
export const ADMINISTRATION_ROUTES = ["VO", "IV", "IM", "SC", "TOPICA", "OFTALMICA", "OTICA", "RECTAL", "INHALADA", "SUBLINGUAL"] as const;

export const ALLERGY_TYPE_LABELS: Record<(typeof ALLERGY_TYPES)[number], string> = {
  MEDICAMENTO: "Medicamento",
  ALIMENTO: "Alimento",
  AMBIENTAL: "Ambiental",
  PICADURA: "Picadura de insecto",
  LATEX: "Látex",
  CONTRASTE: "Medio de contraste",
  OTRO: "Otro",
};
export const ALLERGY_SEVERITY_LABELS: Record<(typeof ALLERGY_SEVERITIES)[number], string> = {
  LEVE: "Leve",
  MODERADA: "Moderada",
  GRAVE: "Grave",
};
export const CLINICAL_DATA_SOURCE_LABELS: Record<(typeof CLINICAL_DATA_SOURCES)[number], string> = {
  PACIENTE: "Referida por el paciente",
  FAMILIAR: "Referida por un familiar",
  EXPEDIENTE_PREVIO: "Expediente previo",
  MEDICO: "Confirmada por el médico",
};
export const ADMINISTRATION_ROUTE_LABELS: Record<(typeof ADMINISTRATION_ROUTES)[number], string> = {
  VO: "Vía oral",
  IV: "Intravenosa",
  IM: "Intramuscular",
  SC: "Subcutánea",
  TOPICA: "Tópica",
  OFTALMICA: "Oftálmica",
  OTICA: "Ótica",
  RECTAL: "Rectal",
  INHALADA: "Inhalada",
  SUBLINGUAL: "Sublingual",
};

export const patientAllergyCreateSchema = z
  .object({
    // P4 §6.4: min(3) — una cadena de 1-2 caracteres («no», «x», «-»)
    // convertía el cruce alergia↔receta por subcadena en falsos
    // positivos garantizados («naproxeno».includes("no")).
    substance: z.string().min(3, "Escribe el agente completo (mínimo 3 caracteres). Si no hay alergias, no captures una fila.").max(200),
    allergyType: z.enum(ALLERGY_TYPES),
    reaction: z.string().max(500).optional(),
    severity: z.enum(ALLERGY_SEVERITIES),
    ageOfOnset: z.string().optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "RULED_OUT"]).optional(),
    certainty: z.enum(["CONFIRMED", "LIKELY", "UNCERTAIN"]),
    source: z.enum(CLINICAL_DATA_SOURCES),
  })
  .strict();
export type PatientAllergyCreateInput = z.infer<typeof patientAllergyCreateSchema>;

export const patientAllergyUpdateSchema = patientAllergyCreateSchema.partial().strict();
export type PatientAllergyUpdateInput = z.infer<typeof patientAllergyUpdateSchema>;

export const patientMedicationCreateSchema = z
  .object({
    genericName: z.string().min(1),
    brandName: z.string().optional(),
    // dose se queda libre a propósito: es una decisión clínica para un
    // paciente concreto, no un vocabulario (P4 §2.8).
    dose: z.string().min(1),
    // P4 §6.1: route es catálogo cerrado; frequency se instrumenta en
    // Fase 4 junto con la receta (P6), aquí sólo se acota.
    route: z.enum(ADMINISTRATION_ROUTES),
    frequency: z.string().min(1).max(120),
    startedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    suspendedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    reason: z.string().optional(),
    status: z.enum(["ACTIVE", "SUSPENDED", "COMPLETED"]).optional(),
    prescriber: z.string().optional(),
    source: z.enum(CLINICAL_DATA_SOURCES),
  })
  .strict();
export type PatientMedicationCreateInput = z.infer<typeof patientMedicationCreateSchema>;

export const patientMedicationUpdateSchema = patientMedicationCreateSchema.partial().strict();
export type PatientMedicationUpdateInput = z.infer<typeof patientMedicationUpdateSchema>;

// M8-RN-012 / §10 de especificacion-plataforma-clinica-con-ia.md:
// antecedentes heredofamiliares (AHF), personales no patológicos
// (APNP) y personales patológicos (APP) — viven en el paciente, se
// capturan una vez y se arrastran (mismo principio que alergias y
// medicamentos arriba). Vocabulario de subtipo transcrito literal de
// §10.1-10.3, sin agregar nada; alergias y medicamentos actuales se
// excluyen porque ya viven en los schemas de arriba.
export const patientHistoryCategorySchema = z.enum(["HEREDOFAMILIAR", "PERSONAL_NO_PATOLOGICO", "PERSONAL_PATOLOGICO"]);
export type PatientHistoryCategory = z.infer<typeof patientHistoryCategorySchema>;

export const patientHistoryStatusSchema = z.enum(["PRESENTE", "NEGADO", "DESCONOCIDO", "NO_INVESTIGADO"]);
export type PatientHistoryStatus = z.infer<typeof patientHistoryStatusSchema>;

export const HEREDOFAMILIAR_SUBTYPES = [
  "estado_vital",
  "diabetes",
  "hipertension",
  "cardiopatia_evento_vascular",
  "cancer",
  "enfermedad_renal",
  "enfermedad_hereditaria_congenita",
  "trastorno_neurologico_psiquiatrico",
  "enfermedad_autoinmune",
  "otro",
] as const;

export const PERSONAL_NO_PATOLOGICO_SUBTYPES = [
  "vivienda_servicios",
  "alimentacion_hidratacion",
  "higiene",
  "actividad_fisica",
  "sueno",
  "ocupacion_exposiciones",
  "viajes_relevantes",
  "tabaquismo",
  "alcohol",
  "otras_sustancias",
  "vacunacion",
  "animales_vectores_riesgos",
] as const;

export const PERSONAL_PATOLOGICO_SUBTYPES = [
  "enfermedades_previas_activas",
  "hospitalizaciones",
  "cirugias",
  "traumatismos",
  "transfusiones",
  "enfermedades_infecciosas_relevantes",
  "discapacidad_apoyos",
  "salud_mental",
] as const;

// Prompt 20: columnas de la matriz heredofamiliar — abuelos separados
// por línea paterna/materna (permite calcular riesgo familiar por
// rama). "ABUELOS" (unificado) queda solo por las filas previas.
export const FAMILY_RELATIONSHIPS = ["MADRE", "PADRE", "ABUELOS_PATERNOS", "ABUELOS_MATERNOS", "HERMANOS", "HIJOS", "ABUELOS", "OTRO"] as const;

export const patientHistoryItemUpsertSchema = z
  .object({
    category: patientHistoryCategorySchema,
    // Prompt 18: forma de clave; la EXISTENCIA se valida en servidor
    // contra el catálogo ANTECEDENTE (un término aprobado por el
    // curador es usable de inmediato; uno inventado se rechaza).
    subtype: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, "Clave de catálogo inválida."),
    familyRelationship: z.enum(FAMILY_RELATIONSHIPS).optional(),
    familyRelationshipDetail: z.string().max(200).optional(),
    status: patientHistoryStatusSchema,
    structuredValue: z.record(z.string(), z.unknown()).optional(),
    freeText: z.string().max(1000).optional(),
  })
  .strict()
  .refine((data) => data.category !== "HEREDOFAMILIAR" || data.familyRelationship !== undefined, {
    message: "familyRelationship es obligatorio para category=HEREDOFAMILIAR.",
    path: ["familyRelationship"],
  })
  .refine((data) => data.category === "HEREDOFAMILIAR" || data.familyRelationship === undefined, {
    message: "familyRelationship solo aplica a category=HEREDOFAMILIAR.",
    path: ["familyRelationship"],
  });
export type PatientHistoryItemUpsertInput = z.infer<typeof patientHistoryItemUpsertSchema>;

export const patientHistoryListQuerySchema = z
  .object({
    category: patientHistoryCategorySchema.optional(),
  })
  .strict();
export type PatientHistoryListQueryInput = z.infer<typeof patientHistoryListQuerySchema>;

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

// ── Fase 1 / hallazgo #18: embarazo (Zona 1 de DOC-06) ─────────────
// FUM y/o FPP en fecha civil (YYYY-MM-DD). El servidor deriva:
//  - eddDate = lmpDate + 280 días cuando no llega una FPP explícita
//    (regla de Naegele; método FUM)
//  - eddMethod = ULTRASONIDO cuando la FPP llega capturada
//  - las SDG se calculan al LEER a partir de eddDate y nunca se
//    almacenan ni viajan del cliente (mismo principio que IMC/escalas)
const civilDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato YYYY-MM-DD.");

export const patientPregnancyCreateSchema = z
  .object({
    lmpDate: civilDateSchema.optional(),
    eddDate: civilDateSchema.optional(),
  })
  .strict()
  .refine((p) => p.lmpDate !== undefined || p.eddDate !== undefined, {
    message: "Captura la FUM, la FPP por ultrasonido, o ambas.",
    path: ["lmpDate"],
  });
export type PatientPregnancyCreateInput = z.infer<typeof patientPregnancyCreateSchema>;

export const patientPregnancyUpdateSchema = z
  .object({
    lmpDate: civilDateSchema.nullable().optional(),
    eddDate: civilDateSchema.optional(),
  })
  .strict();
export type PatientPregnancyUpdateInput = z.infer<typeof patientPregnancyUpdateSchema>;


// ── Fase 2 · Prompt 21: toxicomanías con cuantificación ────────────
export const SUBSTANCE_USE_STATUSES = ["ACTIVO", "SUSPENDIDO", "NEGADO"] as const;
export const SUBSTANCE_USE_UNITS = ["CIGARROS_POR_DIA", "UNIDADES_POR_SEMANA", "UNIDADES_POR_DIA", "OTRA"] as const;

export const substanceUseUpsertSchema = z
  .object({
    // Clave del catálogo SUSTANCIA_PSICOACTIVA — existencia validada
    // en servidor (R2/R3).
    substanceKey: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/),
    status: z.enum(SUBSTANCE_USE_STATUSES),
    quantity: z.number().positive().max(1000).optional(),
    unit: z.enum(SUBSTANCE_USE_UNITS).optional(),
    ageOfOnset: z.number().int().min(0).max(120).optional(),
    suspendedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    comment: z.string().max(500).optional(),
  })
  .strict()
  // Prompt 21: "cantidad y frecuencia son obligatorias cuando el
  // estado es activo o suspendido — un sí-fuma sin cantidad no sirve
  // para ningún cálculo de riesgo".
  .refine((v) => v.status === "NEGADO" || (v.quantity !== undefined && v.unit !== undefined), {
    message: "Con estado activo o suspendido, cantidad y unidad/frecuencia son obligatorias.",
    path: ["quantity"],
  });
export type SubstanceUseUpsertInput = z.infer<typeof substanceUseUpsertSchema>;

// ── Fase 2 · Prompt 22: gineco-obstétricos ─────────────────────────
export const CYCLE_AMOUNTS = ["LEVE", "MODERADA", "ABUNDANTE"] as const;
export const CONTRACEPTIVE_METHODS = [
  "NINGUNO",
  "CONDON",
  "DIU",
  "HORMONAL_ORAL",
  "HORMONAL_INYECTABLE",
  "IMPLANTE",
  "OTB",
  "VASECTOMIA_PAREJA",
  "NATURAL",
  "OTRO",
] as const;

export const gynecoHistoryUpsertSchema = z
  .object({
    menarcheAge: z.number().int().min(6).max(25).nullable().optional(),
    cycleDurationDays: z.number().int().min(1).max(15).nullable().optional(),
    cycleFrequencyDays: z.number().int().min(15).max(120).nullable().optional(),
    cycleAmount: z.enum(CYCLE_AMOUNTS).nullable().optional(),
    dysmenorrhea: z.boolean().nullable().optional(),
    otherDischarge: z.string().max(200).nullable().optional(),
    sexualOnsetAge: z.number().int().min(5).max(100).nullable().optional(),
    sexualPartners: z.number().int().min(0).max(500).nullable().optional(),
    contraceptiveMethod: z.enum(CONTRACEPTIVE_METHODS).nullable().optional(),
    sexualFrequency: z.string().max(120).nullable().optional(),
    stiHistory: z.string().max(300).nullable().optional(),
    gestas: z.number().int().min(0).max(30).nullable().optional(),
    partos: z.number().int().min(0).max(30).nullable().optional(),
    cesareas: z.number().int().min(0).max(30).nullable().optional(),
    abortos: z.number().int().min(0).max(30).nullable().optional(),
    perinatalHistory: z.string().max(500).nullable().optional(),
  })
  .strict();
export type GynecoHistoryUpsertInput = z.infer<typeof gynecoHistoryUpsertSchema>;

// ── Fase 2 · Prompt 23A: alergias ancladas al catálogo ─────────────
// El agente viene del catálogo ALERGIA_AGENTE (por clave); si es
// alergia a fármaco, opcionalmente se ancla al catálogo de
// medicamentos para el cruce de la Fase 4.
export const patientAllergyCatalogCreateSchema = z
  .object({
    agentKey: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/),
    medicationCatalogId: z.string().uuid().optional(),
    allergyType: z.enum(ALLERGY_TYPES),
    reaction: z.string().max(500).optional(),
    severity: z.enum(ALLERGY_SEVERITIES),
    ageOfOnset: z.string().optional(),
    certainty: z.enum(["CONFIRMED", "LIKELY", "UNCERTAIN"]),
    source: z.enum(CLINICAL_DATA_SOURCES),
  })
  .strict();
export type PatientAllergyCatalogCreateInput = z.infer<typeof patientAllergyCatalogCreateSchema>;

// ── Fase 2 · Prompt 23B: plantillas de antecedentes ────────────────
export const antecedentesTemplateItemSchema = z
  .object({
    category: patientHistoryCategorySchema,
    subtype: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/),
    familyRelationship: z.enum(FAMILY_RELATIONSHIPS).optional(),
    status: patientHistoryStatusSchema,
    freeText: z.string().max(1000).optional(),
  })
  .strict();

export const antecedentesTemplateCreateSchema = z
  .object({
    name: z.string().min(1).max(80),
    specialtyCode: z.string().min(1).max(30).optional(),
    items: z.array(antecedentesTemplateItemSchema).min(1).max(100),
  })
  .strict();
export type AntecedentesTemplateCreateInput = z.infer<typeof antecedentesTemplateCreateSchema>;
