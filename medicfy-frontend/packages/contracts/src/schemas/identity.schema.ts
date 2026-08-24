import { z } from "zod";
import { MAX_EMAIL_LENGTH, normalizeEmail } from "../validators/email";
import { isStrongPassword } from "../validators/password";
import { isValidMxPhoneE164 } from "../validators/phone";
import { isValidCedulaFormat } from "../validators/cedula";

const emailSchema = z
  .string()
  .max(MAX_EMAIL_LENGTH, "Ingresa un correo electrónico válido.")
  .email("Ingresa un correo electrónico válido.")
  .transform(normalizeEmail);

const passwordSchema = z
  .string()
  .refine(isStrongPassword, "Tu contraseña debe tener al menos 12 caracteres y no ser una contraseña común.");

const mxPhoneSchema = z.string().refine(isValidMxPhoneE164, "Ingresa un teléfono a 10 dígitos.");

const cedulaSchema = z
  .string()
  .refine(isValidCedulaFormat, "No encontramos esta cédula en el registro de la SEP. Verifica el número.");

// M1-RN-003: (a) privacyNotice and (b) sensitiveData are required —
// "Sin la (a) y la (b) no hay cuenta". (c) is optional; its absence
// only blocks digital prescription delivery later (M9-RN-011), it
// never blocks account creation.
export const registerPatientSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  phone: mxPhoneSchema,
  consents: z.object({
    privacyNotice: z.literal(true, {
      errorMap: () => ({ message: "Debes aceptar el aviso de privacidad." }),
    }),
    sensitiveData: z.literal(true, {
      errorMap: () => ({ message: "Debes aceptar el tratamiento de datos sensibles de salud." }),
    }),
    digitalPrescriptionChannel: z.boolean(),
  }),
});
export type RegisterPatientInput = z.infer<typeof registerPatientSchema>;

// Fields per the M1 flow text (§7 M1, step 1): "email, contraseña,
// nombre legal, cédula profesional, especialidad, teléfono". Document
// upload (step 4) and admin review are M1-RN-002 / M2, not this DTO.
// "especialidad" selects from the M2 catalog (Specialty.code) rather
// than free text — M2-RN-002 ties specialty claims to that catalog,
// so registration should feed it from day one instead of migrating a
// free-text field later.
export const registerDoctorSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  legalFirstName: z.string().min(1).max(120),
  legalLastName: z.string().min(1).max(120),
  professionalLicense: cedulaSchema,
  primarySpecialtyCode: z.string().min(1).max(60),
  phone: mxPhoneSchema,
});
export type RegisterDoctorInput = z.infer<typeof registerDoctorSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const mfaEnrollVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, "El código debe tener 6 dígitos."),
});
export type MfaEnrollVerifyInput = z.infer<typeof mfaEnrollVerifySchema>;

export const mfaLoginVerifySchema = z.object({
  mfaSessionToken: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, "El código debe tener 6 dígitos."),
});
export type MfaLoginVerifyInput = z.infer<typeof mfaLoginVerifySchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export const passwordForgotSchema = z.object({
  email: emailSchema,
});
export type PasswordForgotInput = z.infer<typeof passwordForgotSchema>;

export const passwordResetSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema,
});
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;

export const emailVerifySchema = z.object({
  userId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/, "El código debe tener 6 dígitos."),
});
export type EmailVerifyInput = z.infer<typeof emailVerifySchema>;

export const phoneVerifySchema = z.object({
  userId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/, "El código debe tener 6 dígitos."),
});
export type PhoneVerifyInput = z.infer<typeof phoneVerifySchema>;

// M1-RN-004: consent is versioned; re-acceptance or opting into an
// initially-declined consent (e.g. digital prescription channel) both
// go through this same append-only endpoint.
export const consentUpsertSchema = z.object({
  consentType: z.enum([
    "PRIVACY_NOTICE",
    "SENSITIVE_DATA",
    "TELEMEDICINE",
    "DIGITAL_PRESCRIPTION_CHANNEL",
    "MARKETING",
  ]),
  granted: z.boolean(),
});
export type ConsentUpsertInput = z.infer<typeof consentUpsertSchema>;

// M1-RN-008: up to 3 pending invitations, 72h expiry (enforced in the
// service, not here).
export const assistantInviteSchema = z.object({
  email: emailSchema,
});
export type AssistantInviteInput = z.infer<typeof assistantInviteSchema>;

export const assistantAcceptSchema = z.object({
  token: z.string().min(1),
});
export type AssistantAcceptInput = z.infer<typeof assistantAcceptSchema>;
