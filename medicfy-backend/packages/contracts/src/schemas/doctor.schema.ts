import { z } from "zod";
import { containsContactInfo } from "../validators/biography";
import { isValidPriceMxn } from "../validators/price";
import { isValidCedulaFormat } from "../validators/cedula";
import { isValidMxPhoneE164 } from "../validators/phone";

// Immutable once verificationStatus=VERIFIED (AUTH-RN-004, M2-RN-001).
// Listed here so both the API (403 guard) and the web client (disable
// the input) share one source of truth for which fields those are.
export const IMMUTABLE_DOCTOR_FIELDS = [
  "legalFirstName",
  "legalLastName",
  "professionalLicense",
  "specialtyLicense",
  "specialtyLicenseExpiresAt",
  "primarySpecialtyCode",
] as const;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// M2-RN-006: vencimiento de la cédula de especialidad — mismo estatus
// de inmutabilidad que specialtyLicense (se corrige junto con ella
// antes de VERIFIED, la confirma/ajusta un admin en la verificación,
// nunca la edita libremente un médico ya verificado; si pudiera, el
// degradado del sello al vencer no serviría de nada).
const specialtyLicenseExpiresAtSchema = z
  .string()
  .regex(DATE_ONLY_PATTERN, "Fecha inválida, usa formato YYYY-MM-DD.");

// DT-05 / M5-RN-002: "configurable por médico" — mismo shape que
// CancellationPolicy en scheduling/cancellation-policy.ts. NULL en BD
// (no capturado aún) cae al default del spec ahí mismo, no aquí.
export const cancellationPolicySchema = z.object({
  fullRefundHoursBefore: z.number().int().min(0).max(720),
  partialRefundHoursBefore: z.number().int().min(0).max(720),
  partialRefundPercent: z.number().int().min(0).max(100),
});
export type CancellationPolicyInput = z.infer<typeof cancellationPolicySchema>;

const biographySchema = z
  .string()
  .min(50, "La biografía debe tener al menos 50 caracteres.")
  .max(2000, "La biografía no puede superar 2,000 caracteres.")
  .refine((text) => !containsContactInfo(text), "La biografía no puede incluir teléfono ni correo de contacto.");

// Editable-only per M2-RN-001. Immutable fields are deliberately
// absent from this type — the controller rejects them explicitly with
// 403 before this schema ever runs (M2-CA-002), rather than silently
// stripping them, which would return 200 and hide the attempt.
export const doctorProfileUpdateSchema = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    photoUrl: z.string().url().optional(),
    biography: biographySchema.optional(),
    secondarySpecialtyCodes: z.array(z.string().min(1).max(60)).optional(),
    yearsExperience: z.number().int().min(0).max(70).optional(),
    languages: z.array(z.string().min(1).max(40)).optional(),
    university: z.string().min(1).max(200).optional(),
    acceptsNewPatients: z.boolean().optional(),
    acceptsTeleconsultation: z.boolean().optional(),
    // M4-RN-005: antelación mínima (minutos) y ventana máxima de
    // agenda (días) — "el médico sí edita... horarios" (AUTH-RN-004).
    minBookingNoticeMinutes: z.number().int().min(0).max(10_080).optional(),
    maxBookingWindowDays: z.number().int().min(1).max(365).optional(),
    // Parte B §5.1: datos de contacto profesional y encabezado — nunca
    // campos legales, siempre editables.
    professionalPhone: z.string().refine(isValidMxPhoneE164, "Ingresa un teléfono a 10 dígitos.").optional(),
    professionalEmail: z.string().email("Ingresa un correo electrónico válido.").optional(),
    letterheadPhrase: z.string().max(200).optional(),
    // DT-05: ausente del PATCH hasta ahora aunque la columna y su
    // resolución (M5-RN-002) ya existen.
    cancellationPolicy: cancellationPolicySchema.optional(),
  })
  .strict();
export type DoctorProfileUpdateInput = z.infer<typeof doctorProfileUpdateSchema>;

// M2-CA-002 (aclaración post-v2.1, §17): correction path for the four
// immutable fields, valid only while verificationStatus is DRAFT,
// SUBMITTED, or REJECTED — never IN_REVIEW/VERIFIED/SUSPENDED (that's
// the 403 path, enforced separately). Editing while SUBMITTED or
// REJECTED reverts the record to DRAFT.
export const doctorLegalFieldsUpdateSchema = z
  .object({
    legalFirstName: z.string().min(1).max(120).optional(),
    legalLastName: z.string().min(1).max(120).optional(),
    professionalLicense: z
      .string()
      .refine(isValidCedulaFormat, "La cédula profesional debe tener 7 u 8 dígitos numéricos.")
      .optional(),
    specialtyLicense: z.string().min(1).max(60).optional(),
    specialtyLicenseExpiresAt: specialtyLicenseExpiresAtSchema.optional(),
    primarySpecialtyCode: z.string().min(1).max(60).optional(),
  })
  .strict();
export type DoctorLegalFieldsUpdateInput = z.infer<typeof doctorLegalFieldsUpdateSchema>;

export const practiceLocationSchema = z.object({
  name: z.string().min(1).max(160),
  addressStreet: z.string().max(200).optional(),
  addressExt: z.string().max(20).optional(),
  addressInt: z.string().max(20).optional(),
  addressColonia: z.string().max(120).optional(),
  addressMunicipality: z.string().max(120).optional(),
  addressState: z.string().max(120).optional(),
  addressPostalCode: z.string().max(10).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  phone: z.string().max(20).optional(),
  isPrimary: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export type PracticeLocationInput = z.infer<typeof practiceLocationSchema>;

// DT-02: PATCH /doctors/me/locations/:id had no runtime validation at
// all before this (body typed as Partial<PracticeLocationInput> in
// the controller, TypeScript-only). .strict() is added only on this
// update variant, not on the create schema above — scoped to fixing
// the missing validation, not changing POST's already-shipped
// behavior.
export const practiceLocationUpdateSchema = practiceLocationSchema.partial().strict();
export type PracticeLocationUpdateInput = z.infer<typeof practiceLocationUpdateSchema>;

export const doctorServiceSchema = z.object({
  locationId: z.string().uuid().nullable().optional(),
  serviceType: z.enum(["FIRST_VISIT", "FOLLOW_UP", "TELECONSULTATION", "PROCEDURE"]),
  name: z.string().min(1).max(160),
  durationMinutes: z.number().int().min(5).max(240),
  priceMxn: z.number().refine(isValidPriceMxn, "El precio debe ser un entero entre 1 y 99,999 MXN."),
  priceVisibility: z.enum(["PRIVATE", "SHARED_ON_BOOKING"]).optional(),
  isActive: z.boolean().optional(),
});
export type DoctorServiceInput = z.infer<typeof doctorServiceSchema>;

// DT-02: same fix as practiceLocationUpdateSchema above, for
// PATCH /doctors/me/services/:id.
export const doctorServiceUpdateSchema = doctorServiceSchema.partial().strict();
export type DoctorServiceUpdateInput = z.infer<typeof doctorServiceUpdateSchema>;

export const documentUploadMetadataSchema = z.object({
  docType: z.enum([
    "CEDULA_PROFESIONAL",
    "CEDULA_ESPECIALIDAD",
    "INE",
    "CV",
    "CERTIFICADO_CONSEJO",
    "COMPROBANTE_DOMICILIO",
  ]),
});
export type DocumentUploadMetadataInput = z.infer<typeof documentUploadMetadataSchema>;

export const rejectDoctorSchema = z.object({
  reason: z.string().min(10, "El motivo de rechazo es obligatorio y debe ser descriptivo.").max(1000),
});
export type RejectDoctorInput = z.infer<typeof rejectDoctorSchema>;

// Parte B §1.2/§5.1: logo y firma visual del médico — assets de
// presentación, sin flujo de revisión admin (a diferencia de
// DoctorDocument).
export const brandingAssetUploadMetadataSchema = z.object({
  kind: z.enum(["logo", "signature"]),
});
export type BrandingAssetUploadMetadataInput = z.infer<typeof brandingAssetUploadMetadataSchema>;

// Parte B §5.2 [AGREGAR]: "verificado con especialidad no confirmada".
// Opcional y retrocompatible — .optional().default({}) porque las
// llamadas existentes a POST /admin/doctors/:id/verify no mandan body
// en absoluto (ni Content-Type), así que req.body puede llegar
// undefined, no solo {}.
export const verifyDoctorSchema = z
  .object({
    specialtyConfirmed: z.boolean().optional(),
    // M2-RN-006: el admin confirma/corrige la fecha de vencimiento
    // leída del documento subido (CERTIFICADO_CONSEJO) al momento de
    // verificar — el valor que el médico capturó antes de la revisión
    // es solo un borrador.
    specialtyLicenseExpiresAt: specialtyLicenseExpiresAtSchema.optional(),
  })
  .optional()
  .default({});
export type VerifyDoctorInput = z.infer<typeof verifyDoctorSchema>;

// M3 (spec §7, v2.3/v2.4): GET /doctors/public — todo opcional, todo
// sobre campos que ya existen (M3-RN-006). Los booleans llegan como
// query string, nunca como JSON — z.coerce.boolean() trataría "false"
// como string no vacío -> true, por eso el enum explícito.
const queryBooleanSchema = z
  .enum(["true", "false"])
  .transform((v) => v === "true")
  .optional();

export const doctorPublicSearchQuerySchema = z.object({
  q: z.string().max(120).optional(),
  specialty: z.string().max(60).optional(),
  location: z.string().max(120).optional(),
  language: z.string().max(40).optional(),
  teleconsultation: queryBooleanSchema,
  acceptsNewPatients: queryBooleanSchema,
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
export type DoctorPublicSearchQuery = z.infer<typeof doctorPublicSearchQuerySchema>;
