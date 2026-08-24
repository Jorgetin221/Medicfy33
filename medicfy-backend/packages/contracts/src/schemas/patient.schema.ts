import { z } from "zod";
import { MAX_EMAIL_LENGTH, normalizeEmail } from "../validators/email";
import { isValidMxPhoneE164 } from "../validators/phone";
import { isValidCurp } from "../validators/curp";
import { isValidBirthDate } from "../validators/birthDate";
import { calculateAge } from "../validators/age";

const emailSchema = z
  .string()
  .max(MAX_EMAIL_LENGTH, "Ingresa un correo electrónico válido.")
  .email("Ingresa un correo electrónico válido.")
  .transform(normalizeEmail);

const phoneSchema = z.string().refine(isValidMxPhoneE164, "Ingresa un teléfono a 10 dígitos.");
const curpSchema = z.string().refine(isValidCurp, "CURP inválida.");

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const birthDateSchema = z
  .string()
  .regex(DATE_ONLY_PATTERN, "Fecha inválida, usa formato YYYY-MM-DD.")
  .refine(
    (value) => isValidBirthDate(new Date(`${value}T00:00:00Z`)),
    "Fecha de nacimiento fuera de rango (entre hoy y hace 120 años)."
  );

// §6.4 "Menor de edad" caso límite: obligatorio en alcance. Todo el
// registro de tutor requerido por §6.2's patient_guardians.
const guardianCreateSchema = z.object({
  guardianName: z.string().min(1).max(160),
  guardianRelation: z.enum(["MADRE", "PADRE", "TUTOR_LEGAL", "OTRO"]),
  guardianCurp: curpSchema.optional(),
  guardianPhoneE164: phoneSchema,
  guardianEmail: emailSchema,
  // Simplificación de alcance para M5a: se acepta como referencia de
  // archivo ya subido (mismo campo que doctor_documents.file_key), no
  // se construyó un endpoint de subida dedicado para el INE del tutor
  // — no estaba en el alcance que se pidió para M5a. Natural
  // extenderlo a un flujo real (mismo FileStoragePort que
  // DoctorDocumentService) cuando se necesite.
  guardianIdDocumentKey: z.string().min(1),
});
export type GuardianCreateInput = z.infer<typeof guardianCreateSchema>;

// M5-RN-008: mínimo "nombre, teléfono, email, fecha de nacimiento" +
// consentimientos — los consentimientos del paciente-sin-cuenta vía
// enlace público son M5b (flujo público, no construido aquí). M5a
// cubre la creación autenticada por DOCTOR/ASSISTANT (M2-CA-009).
export const patientCreateSchema = z
  .object({
    firstName: z.string().min(1).max(120),
    lastNamePaternal: z.string().min(1).max(120),
    lastNameMaternal: z.string().max(120).optional(),
    birthDate: birthDateSchema,
    sexAtBirth: z.enum(["F", "M"]),
    genderIdentity: z.string().max(60).optional(),
    curp: curpSchema.optional(),
    bloodType: z.string().max(10).optional(),
    phoneE164: phoneSchema,
    email: emailSchema,
    addressStreet: z.string().max(200).optional(),
    addressExt: z.string().max(20).optional(),
    addressInt: z.string().max(20).optional(),
    addressColonia: z.string().max(120).optional(),
    addressMunicipality: z.string().max(120).optional(),
    addressState: z.string().max(120).optional(),
    addressPostalCode: z.string().max(10).optional(),
    emergencyContactName: z.string().max(160).optional(),
    emergencyContactPhone: phoneSchema.optional(),
    emergencyContactRelation: z.string().max(60).optional(),
    guardian: guardianCreateSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const age = calculateAge(new Date(`${data.birthDate}T00:00:00Z`));
    if (age < 18 && !data.guardian) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Paciente menor de edad: se requiere registro de tutor.",
        path: ["guardian"],
      });
    }
  });
export type PatientCreateInput = z.infer<typeof patientCreateSchema>;

export const appointmentCreateSchema = z
  .object({
    patientId: z.string().uuid(),
    serviceId: z.string().uuid(),
    locationId: z.string().uuid().optional(),
    startsAt: z.string().datetime(),
  })
  .strict();
export type AppointmentCreateInput = z.infer<typeof appointmentCreateSchema>;

// M5-RN-002/003: quién cancela cambia el reembolso (100% si el
// médico, según política si el paciente) — como M5a solo autentica
// DOCTOR/ASSISTANT, el personal puede estar cancelando a petición del
// paciente (llamada telefónica), así que el rol se declara
// explícitamente en vez de asumirse del llamante. Default PATIENT:
// es el caso más común (paciente pide cancelar, recepción lo captura).
export const appointmentCancelSchema = z
  .object({
    reason: z.string().max(500).optional(),
    cancelledAsRole: z.enum(["DOCTOR", "PATIENT"]).optional(),
  })
  .strict();
export type AppointmentCancelInput = z.infer<typeof appointmentCancelSchema>;

export const appointmentRescheduleSchema = z
  .object({
    newStartsAt: z.string().datetime(),
    rescheduledAsRole: z.enum(["DOCTOR", "PATIENT"]).optional(),
  })
  .strict();
export type AppointmentRescheduleInput = z.infer<typeof appointmentRescheduleSchema>;

// M5-RN-006: M8's signed-note check doesn't exist yet, so every
// completion in M5a goes through the spec's own documented escape
// hatch — "consulta sin nota" con justificación, auditado. Becomes
// the exception path (not the only path) once M8 exists.
export const appointmentCompleteSchema = z
  .object({ justification: z.string().min(10, "La justificación debe ser descriptiva.").max(1000) })
  .strict();
export type AppointmentCompleteInput = z.infer<typeof appointmentCompleteSchema>;
