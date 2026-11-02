import { z } from "zod";
import { birthDateSchema } from "./patient.schema";

// PR-EXP-01 (Bloque 1 — expediente compartido autorizado por el
// paciente). Solo los tipos CERRADOS (R2) del modelo de datos — los
// esquemas de petición/respuesta de cada endpoint (solicitud,
// autorización, visor) llegan con PR-EXP-02 en adelante, cuando esos
// endpoints existan. Ver docs/expediente-compartido/00-DESCUBRIMIENTO.md
// y prisma/schema.prisma (enums ShareScope/SensitiveCategory/...) — los
// valores de abajo deben coincidir exactamente con esos enums de Postgres.

export const SHARE_SCOPES = ["SUMMARY", "SIGNED_NOTES", "RESULTS", "PRESCRIPTIONS", "STUDY_ORDERS"] as const;
export const shareScopeSchema = z.enum(SHARE_SCOPES);
export type ShareScope = z.infer<typeof shareScopeSchema>;

export const SENSITIVE_CATEGORIES = ["MENTAL_HEALTH", "HIV_STI", "REPRODUCTIVE_HEALTH", "SUBSTANCE_USE", "GENETIC"] as const;
export const sensitiveCategorySchema = z.enum(SENSITIVE_CATEGORIES);
export type SensitiveCategory = z.infer<typeof sensitiveCategorySchema>;

// D-EXP-06: solo estas tres duraciones. Cerrado en el contrato, no en
// el tipo de columna de Postgres (es INTEGER) — mismo criterio que los
// dominios de ClinicalCatalogTerm: ampliar el conjunto es un cambio de
// código, nunca una migración.
export const SHARE_DURATION_DAYS_OPTIONS = [7, 30, 90] as const;
export const shareDurationDaysSchema = z.union([z.literal(7), z.literal(30), z.literal(90)]);
export type ShareDurationDays = z.infer<typeof shareDurationDaysSchema>;

export const recordShareRequestStatusSchema = z.enum([
  "PENDING_PATIENT",
  // El paciente ya autorizó; falta su médico tratante (doble autorización).
  "PENDING_CUSTODIAN",
  "APPROVED",
  "DENIED",
  "EXPIRED_UNANSWERED",
  "CANCELLED_BY_REQUESTER",
]);
export type RecordShareRequestStatus = z.infer<typeof recordShareRequestStatusSchema>;

export const recordShareConsentDecisionSchema = z.enum(["APPROVED", "DENIED"]);
export type RecordShareConsentDecision = z.infer<typeof recordShareConsentDecisionSchema>;

export const recordShareGrantStatusSchema = z.enum(["ACTIVE", "EXPIRED", "REVOKED_BY_PATIENT", "SUSPENDED_BY_ADMIN"]);
export type RecordShareGrantStatus = z.infer<typeof recordShareGrantStatusSchema>;

// 15-500 caracteres: mismo mínimo que closeJustification en "cerrar sin
// nota" (consulta-form.tsx) — evita motivos vacíos o de una palabra.
// Lo usa PR-EXP-02 al validar el DTO de la solicitud; se declara ya
// aquí porque es parte del "shape" cerrado del dato, no de un endpoint.
export const shareRequestReasonSchema = z.string().trim().min(15).max(500);

// PR-EXP-02 — D-EXP-04: identificadores del paciente tal como los
// escribe el médico, SIN normalizar todavía (la normalización de
// nombre/teléfono ocurre en el servicio, no aquí — un teléfono con
// espacios o sin "+52" no es un error de validación, es algo que el
// servicio intenta normalizar y, si no puede, simplemente no
// encuentra coincidencia — nunca un 400 que revele por qué). Al menos
// uno de phone/email es obligatorio (D-EXP-04: "teléfono O correo").
// lastNameMaternal/phone/email SIN `.min(1)`: un campo HTML dejado en
// blanco llega como `""`, no como `undefined` — con `.min(1)` eso
// rechazaba el formulario aunque el campo fuera opcional (mismo
// criterio que `patient.schema.ts` ya usa para su propio
// lastNameMaternal). El refine de abajo ya trata `""` como "no
// capturado" porque `Boolean("")` es falso.
export const patientIdentifierSchema = z
  .object({
    firstName: z.string().trim().min(1).max(200),
    lastNamePaternal: z.string().trim().min(1).max(200),
    lastNameMaternal: z.string().trim().max(200).optional(),
    birthDate: birthDateSchema,
    phone: z.string().trim().max(30).optional(),
    email: z.string().trim().max(254).optional(),
  })
  .refine((data) => Boolean(data.phone) || Boolean(data.email), {
    message: "Captura al menos un teléfono o un correo del paciente.",
    path: ["phone"],
  });
export type PatientIdentifierInput = z.infer<typeof patientIdentifierSchema>;

// D-EXP-05: "Resumen" es el mínimo — bloqueado en la UI, exigido aquí
// para que un cliente manipulado no pueda omitirlo.
export const shareRequestCreateSchema = z.object({
  patient: patientIdentifierSchema,
  reason: shareRequestReasonSchema,
  scope: z
    .array(shareScopeSchema)
    .min(1)
    .refine((arr) => arr.includes("SUMMARY"), { message: "El alcance debe incluir el Resumen clínico." }),
  durationDays: shareDurationDaysSchema,
});
export type ShareRequestCreateInput = z.infer<typeof shareRequestCreateSchema>;

// Forma de "Mis solicitudes" (PR-EXP-02) — igual que
// TeleconsultationRoom: esquema de RESPUESTA, no de petición.
export const shareRequestSummarySchema = z.object({
  id: z.string().uuid(),
  status: recordShareRequestStatusSchema,
  requestedScope: z.array(shareScopeSchema),
  requestedDurationDays: z.number(),
  reason: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
});
export type ShareRequestSummary = z.infer<typeof shareRequestSummarySchema>;

// PR-EXP-03 — página pública de autorización. Esquema de RESPUESTA:
// deliberadamente NO incluye ningún dato del paciente ni del
// custodio (RE5/RE9) — solo lo que el paciente necesita para decidir
// si reconoce la solicitud.
export const recordShareAuthorizationInfoSchema = z.object({
  requesterDisplayName: z.string(),
  requesterLicense: z.string(),
  requesterSpecialtyName: z.string().nullable(),
  reason: z.string(),
  requestedScope: z.array(shareScopeSchema),
  requestedDurationDays: z.number(),
  // El paciente debe leer EXACTAMENTE el texto cuyo hash se va a
  // guardar al decidir — nunca una copia mantenida aparte en el
  // frontend (ver 03-autorizacion-del-paciente.md §4). El texto lleva
  // el nombre del médico y la fecha de vencimiento, que depende de la
  // duración elegida: el servidor lo manda ya completado para cada
  // duración permitida (nunca más larga que la pedida). Ninguna fecha
  // se calcula en el navegador.
  consentTextVersion: z.string(),
  consentOptions: z.array(
    z.object({
      durationDays: z.number(),
      text: z.string(),
      acknowledgement: z.string(),
      sha256: z.string(),
    })
  ),
});
export type RecordShareAuthorizationInfo = z.infer<typeof recordShareAuthorizationInfoSchema>;

// Bandeja del paciente CON CUENTA (campana en /mi-cuenta): la misma
// información que la página pública de autorización, más el médico que
// lleva el expediente (el paciente lo conoce: es su propio médico) y
// la vigencia de la solicitud. Nunca dato clínico.
export interface PatientShareRequestItem extends RecordShareAuthorizationInfo {
  id: string;
  custodianDisplayName: string;
  createdAt: string;
  expiresAt: string;
  // true: el paciente ya autorizó y falta su médico tratante. No
  // necesita acción del paciente (no cuenta en la campana).
  awaitingCustodian: boolean;
}

// Accesos que el propio paciente autorizó, para revocarlos desde su
// cuenta (ya no recibe enlace de revocación por correo).
export interface PatientShareGrantItem {
  id: string;
  requesterDisplayName: string;
  requesterLicense: string;
  custodianDisplayName: string;
  scope: ShareScope[];
  startsAt: string;
  expiresAt: string;
  status: RecordShareGrantStatus;
  revokedAt: string | null;
  // "Quedará registrado, y podrás ver cuándo lo consultó."
  views: { viewedAt: string }[];
}

// Bandeja del médico TRATANTE (custodio): solicitudes de otros médicos
// para ver el expediente de SUS pacientes. Doble autorización: el
// acceso solo se crea cuando el paciente y este médico aprueban.
export interface CustodianShareRequestItem {
  id: string;
  patientId: string;
  patientName: string;
  patientMedicfyId: string;
  requesterDisplayName: string;
  requesterLicense: string;
  requesterSpecialtyName: string | null;
  reason: string;
  requestedScope: ShareScope[];
  requestedDurationDays: number;
  // ¿El paciente ya autorizó? (PENDING_CUSTODIAN)
  patientApproved: boolean;
  createdAt: string;
  expiresAt: string;
}

export const custodianShareDecisionSchema = z.object({ decision: z.enum(["APPROVED", "DENIED"]) }).strict();
export type CustodianShareDecisionInput = z.infer<typeof custodianShareDecisionSchema>;

// Sección B: 6 dígitos. El formato se valida aquí; que sea el código
// correcto, vigente y no usado lo decide el servidor.
export const recordShareOtpVerifySchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Ingresa los 6 dígitos del código."),
});
export type RecordShareOtpVerifyInput = z.infer<typeof recordShareOtpVerifySchema>;

// PR-EXP-03 §6: "nunca ampliar" se valida otra vez en el SERVIDOR
// (contra request.requestedScope/requestedDurationDays) — este
// esquema solo cierra la FORMA del dato, no la regla de negocio.
export const recordShareDecisionInputSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("APPROVED"),
    approvedScope: z.array(shareScopeSchema).min(1),
    includedSensitiveCategories: z.array(sensitiveCategorySchema).default([]),
    pregnancyExcluded: z.boolean().default(false),
    durationDays: shareDurationDaysSchema,
    // Huella del texto (con casilla) que el paciente leyó para ESTA
    // duración; el servidor la recalcula y rechaza si no coincide.
    consentTextSha256: z.string().regex(/^[a-f0-9]{64}$/),
    acknowledged: z.literal(true, {
      errorMap: () => ({ message: "Debes confirmar que entiendes y autorizas el acceso." }),
    }),
  }),
  z.object({ decision: z.literal("DENIED") }),
]);
export type RecordShareDecisionInput = z.infer<typeof recordShareDecisionInputSchema>;

// PR-EXP-04 — contrato del Resumen clínico compartible, consumido por
// PR-EXP-05 (el visor). RE2/RE3: las secciones gateadas por alcance
// (results/signedNotes/prescriptions/studyOrders) son `null` cuando
// ese alcance no se pidió — NUNCA un arreglo vacío, para no confundir
// "no se pidió" con "no hay datos" (00-DESCUBRIMIENTO.md Q7/PR-EXP-04).
export const sharedRecordAllergySchema = z.object({
  id: z.string(),
  substance: z.string(),
  allergyType: z.string(),
  severity: z.string(),
  reaction: z.string().nullable(),
  certainty: z.string(),
  status: z.string(),
});

export const sharedRecordMedicationSchema = z.object({
  id: z.string(),
  genericName: z.string(),
  brandName: z.string().nullable(),
  dose: z.string(),
  route: z.string(),
  frequency: z.string(),
  status: z.string(),
});

export const sharedRecordDiagnosisSchema = z.object({
  icd10Code: z.string().nullable(),
  description: z.string(),
  diagnosisType: z.string(),
  certainty: z.string(),
  firstRecordedAt: z.string(),
  lastRecordedAt: z.string(),
});

export const sharedRecordHistoryItemSchema = z.object({
  category: z.string(),
  subtype: z.string(),
  status: z.string(),
  freeText: z.string().nullable(),
});

export const sharedRecordPregnancySchema = z.object({
  eddDate: z.string(),
  eddMethod: z.string(),
  gestationalAge: z.object({ weeks: z.number(), days: z.number() }),
});

export const sharedRecordVitalsSchema = z.object({
  recordedAt: z.string(),
  bpSystolicMmHg: z.number().nullable(),
  bpDiastolicMmHg: z.number().nullable(),
  heartRateBpm: z.number().nullable(),
  respiratoryRateBpm: z.number().nullable(),
  temperatureC: z.number().nullable(),
  spo2Percent: z.number().nullable(),
  weightKg: z.number().nullable(),
  heightCm: z.number().nullable(),
  bmi: z.number().nullable(),
});

export const sharedRecordResultSchema = z.object({
  analyteName: z.string(),
  value: z.number(),
  unit: z.string(),
  referenceMin: z.number().nullable(),
  referenceMax: z.number().nullable(),
  measuredAt: z.string(),
});

export const sharedRecordNoteSchema = z.object({
  encounterId: z.string(),
  encounterType: z.string(),
  signedAt: z.string(),
  doctorName: z.string(),
  doctorSpecialtyName: z.string().nullable(),
  chiefComplaint: z.string(),
  currentIllness: z.string(),
  physicalExam: z.string().nullable(),
  assessment: z.string(),
  plan: z.string(),
  prognosis: z.string().nullable(),
});

export const sharedRecordPrescriptionSchema = z.object({
  id: z.string(),
  folio: z.string(),
  issuedAt: z.string(),
  diagnosisSnapshot: z.string(),
});

export const sharedRecordStudyOrderSchema = z.object({
  id: z.string(),
  folio: z.string(),
  issuedAt: z.string(),
  clinicalIndication: z.string(),
});

export const sharedRecordSummarySchema = z.object({
  allergies: z.array(sharedRecordAllergySchema),
  medications: z.array(sharedRecordMedicationSchema),
  activeDiagnoses: z.array(sharedRecordDiagnosisSchema),
  historyItems: z.array(sharedRecordHistoryItemSchema),
  pregnancy: sharedRecordPregnancySchema.nullable(),
  latestVitals: sharedRecordVitalsSchema.nullable(),
  results: z.array(sharedRecordResultSchema).nullable(),
  signedNotes: z.array(sharedRecordNoteSchema).nullable(),
  prescriptions: z.array(sharedRecordPrescriptionSchema).nullable(),
  studyOrders: z.array(sharedRecordStudyOrderSchema).nullable(),
});
export type SharedRecordSummary = z.infer<typeof sharedRecordSummarySchema>;

// PR-EXP-05 — "Compartidos conmigo" (bandeja) y el visor. A
// diferencia de PR-EXP-02/03 (RE5: nunca antes de autorizar), aquí el
// acceso YA fue autorizado por el paciente — mostrar su nombre al
// médico que ya tiene permiso es necesario, no una fuga (decisión §4
// de 05-visor-medico-receptor.md).
export const recordShareGrantMineSchema = z.object({
  id: z.string().uuid(),
  patientName: z.string(),
  custodianDisplayName: z.string(),
  scope: z.array(shareScopeSchema),
  status: recordShareGrantStatusSchema,
  startsAt: z.string(),
  expiresAt: z.string(),
});
export type RecordShareGrantMine = z.infer<typeof recordShareGrantMineSchema>;

export const recordShareGrantDetailSchema = z.object({
  id: z.string().uuid(),
  patientName: z.string(),
  patientBirthDate: z.string(),
  custodianDisplayName: z.string(),
  scope: z.array(shareScopeSchema),
  status: recordShareGrantStatusSchema,
  expiresAt: z.string(),
  summary: sharedRecordSummarySchema,
});
export type RecordShareGrantDetail = z.infer<typeof recordShareGrantDetailSchema>;

// PR-EXP-06 — revocación por el paciente (página pública, sin cuenta).
// Igual que la autorización: el token del enlace es el único "login".
// Solo lo mínimo para identificar a quién se le quita el acceso — sin
// dato clínico (RE9).
export const recordShareRevocationGrantSchema = z.object({
  grantId: z.string().uuid(),
  requesterDisplayName: z.string(),
  requesterLicense: z.string(),
  requesterSpecialtyName: z.string().nullable(),
  scope: z.array(shareScopeSchema),
  expiresAt: z.string(),
  // El grant del enlace que el paciente abrió (los demás son otros
  // accesos vigentes del mismo paciente).
  isLinkGrant: z.boolean(),
});
export type RecordShareRevocationGrant = z.infer<typeof recordShareRevocationGrantSchema>;

export const recordShareRevocationInfoSchema = z.object({
  activeGrants: z.array(recordShareRevocationGrantSchema),
});
export type RecordShareRevocationInfo = z.infer<typeof recordShareRevocationInfoSchema>;

export const recordShareRevokeInputSchema = z.object({
  grantId: z.string().uuid(),
});
export type RecordShareRevokeInput = z.infer<typeof recordShareRevokeInputSchema>;

// PR-EXP-06 — pestaña "Compartido" del custodio en el perfil del
// paciente. El custodio ve quién tiene acceso y cuándo lo consultó;
// no revoca (eso es del paciente) — solo puede reportar abuso.
export const recordShareCustodianViewSchema = z.object({
  viewedAt: z.string(),
});

export const recordShareCustodianGrantSchema = z.object({
  id: z.string().uuid(),
  requesterDisplayName: z.string(),
  requesterLicense: z.string(),
  scope: z.array(shareScopeSchema),
  status: recordShareGrantStatusSchema,
  startsAt: z.string(),
  expiresAt: z.string(),
  revokedAt: z.string().nullable(),
  views: z.array(recordShareCustodianViewSchema),
  abuseReported: z.boolean(),
});
export type RecordShareCustodianGrant = z.infer<typeof recordShareCustodianGrantSchema>;

export const recordShareAbuseReportInputSchema = z.object({
  reason: z.string().trim().min(15).max(500),
});
export type RecordShareAbuseReportInput = z.infer<typeof recordShareAbuseReportInputSchema>;

// PR-EXP-06 — admin: solo metadatos (R4), nunca contenido clínico.
export const recordShareAbuseReportSchema = z.object({
  auditId: z.string().uuid(),
  grantId: z.string().uuid(),
  reportedAt: z.string(),
  reason: z.string(),
  requesterDisplayName: z.string(),
  requesterLicense: z.string(),
  custodianDisplayName: z.string(),
  grantStatus: recordShareGrantStatusSchema,
  grantExpiresAt: z.string(),
});
export type RecordShareAbuseReport = z.infer<typeof recordShareAbuseReportSchema>;

export const recordShareSuspendInputSchema = z.object({
  reason: z.string().trim().min(15).max(500),
});
export type RecordShareSuspendInput = z.infer<typeof recordShareSuspendInputSchema>;
