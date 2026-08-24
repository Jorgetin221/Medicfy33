import type { AppointmentStatus } from "@prisma/client";

// Mirrors the WHERE clause on the appointments_no_overlap EXCLUDE
// constraint (see the M5a migration's raw SQL) — kept as one shared
// constant so application-level slot computation (M4-RN-002's
// "− appointments activas" term) never disagrees with what the
// database itself treats as occupying the doctor's time.
export const NON_OCCUPYING_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  "CANCELLED_BY_PATIENT",
  "CANCELLED_BY_DOCTOR",
];
