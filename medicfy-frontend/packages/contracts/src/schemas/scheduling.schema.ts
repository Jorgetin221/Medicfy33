import { z } from "zod";
import { isValidTimeOfDay } from "../validators/time-of-day";

// M4 "Validaciones": duración de espacio 5–240 min, buffer 0–60 min,
// bloqueo máximo 365 días.
export const MIN_SLOT_DURATION_MINUTES = 5;
export const MAX_SLOT_DURATION_MINUTES = 240;
export const MIN_BUFFER_MINUTES = 0;
export const MAX_BUFFER_MINUTES = 60;
export const MAX_EXCEPTION_BLOCK_DAYS = 365;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const dateOnlySchema = z.string().regex(DATE_ONLY_PATTERN, "Fecha inválida, usa formato YYYY-MM-DD.");
const timeOfDaySchema = z.string().refine(isValidTimeOfDay, "Hora inválida, usa formato HH:MM.");

// M4 "Validaciones": start_time < end_time. Checked here on the raw
// HH:MM strings (lexicographic order matches chronological order for
// zero-padded HH:MM) — cross-rule overlap (M4-RN-004) can't be
// checked at this layer, that needs the service and the DB.
function issueIfTimeOutOfOrder(startTime: string, endTime: string, ctx: z.RefinementCtx): void {
  if (isValidTimeOfDay(startTime) && isValidTimeOfDay(endTime) && startTime >= endTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "La hora de inicio debe ser antes que la hora de fin.",
      path: ["endTime"],
    });
  }
}

export const availabilityRuleCreateSchema = z
  .object({
    locationId: z.string().uuid().nullable().optional(),
    modality: z.enum(["IN_PERSON", "ONLINE"]),
    weekday: z.number().int().min(0).max(6),
    startTime: timeOfDaySchema,
    endTime: timeOfDaySchema,
    slotDurationMinutes: z.number().int().min(MIN_SLOT_DURATION_MINUTES).max(MAX_SLOT_DURATION_MINUTES),
    bufferMinutes: z.number().int().min(MIN_BUFFER_MINUTES).max(MAX_BUFFER_MINUTES).optional(),
    validFrom: dateOnlySchema,
    validUntil: dateOnlySchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => issueIfTimeOutOfOrder(data.startTime, data.endTime, ctx));
export type AvailabilityRuleCreateInput = z.infer<typeof availabilityRuleCreateSchema>;

export const availabilityRuleUpdateSchema = z
  .object({
    locationId: z.string().uuid().nullable().optional(),
    modality: z.enum(["IN_PERSON", "ONLINE"]).optional(),
    weekday: z.number().int().min(0).max(6).optional(),
    startTime: timeOfDaySchema.optional(),
    endTime: timeOfDaySchema.optional(),
    slotDurationMinutes: z.number().int().min(MIN_SLOT_DURATION_MINUTES).max(MAX_SLOT_DURATION_MINUTES).optional(),
    bufferMinutes: z.number().int().min(MIN_BUFFER_MINUTES).max(MAX_BUFFER_MINUTES).optional(),
    validFrom: dateOnlySchema.optional(),
    validUntil: dateOnlySchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.startTime && data.endTime) {
      issueIfTimeOutOfOrder(data.startTime, data.endTime, ctx);
    }
  });
export type AvailabilityRuleUpdateInput = z.infer<typeof availabilityRuleUpdateSchema>;

export const availabilityExceptionCreateSchema = z
  .object({
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    reason: z.string().max(500).optional(),
    blocksAllDay: z.boolean().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const start = new Date(data.startAt);
    const end = new Date(data.endAt);
    if (start.getTime() >= end.getTime()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "startAt debe ser antes que endAt.", path: ["endAt"] });
      return;
    }
    const blockDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    if (blockDays > MAX_EXCEPTION_BLOCK_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Un bloqueo no puede durar más de ${MAX_EXCEPTION_BLOCK_DAYS} días.`,
        path: ["endAt"],
      });
    }
  });
export type AvailabilityExceptionCreateInput = z.infer<typeof availabilityExceptionCreateSchema>;

// §8.1: GET /doctors/{id}/availability?from&to&service_id — snake_case
// query keys match the spec's literal wire contract (same convention
// as GET /admin/doctors?verification_status=). Sprint 5c: from/to son
// opcionales — sin ellos, el controlador asume "hoy" y una ventana
// por defecto, calculadas en el servidor (nunca en el navegador,
// CLAUDE.md §4), igual que el default de GET /appointments.
export const availabilityQuerySchema = z.object({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  service_id: z.string().uuid(),
});
export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;

// Sprint 5c: DOC-01 "agenda del día" — filtra GET /appointments a un
// día calendario en America/Mexico_City. Sin `date`, el servidor
// asume "hoy" (calculado en el servidor, nunca en el navegador).
export const appointmentListQuerySchema = z.object({
  date: dateOnlySchema.optional(),
});
export type AppointmentListQueryInput = z.infer<typeof appointmentListQuerySchema>;
