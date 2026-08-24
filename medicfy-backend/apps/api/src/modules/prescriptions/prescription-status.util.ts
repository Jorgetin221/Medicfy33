// Un solo lugar que decide cómo se deriva el estado público de una
// receta desde sus filas satélite — usado por
// PrescriptionService.getByVerificationToken() (público) y por
// PatientClinicalService.timeline() (expediente). Nunca un campo
// guardado en `prescriptions` (R1: append-only, sin UPDATE).
export type PrescriptionDerivedStatus = "ISSUED" | "CANCELLED" | "PENDING_HANDWRITTEN_SIGNATURE";

export function derivePrescriptionStatus(prescription: {
  cancellation: unknown;
  signatureRoute: string | null;
  handwrittenDelivery: unknown;
}): PrescriptionDerivedStatus {
  if (prescription.cancellation) return "CANCELLED";
  if (prescription.signatureRoute === "HANDWRITTEN_AFTER_PRINT" && !prescription.handwrittenDelivery) {
    return "PENDING_HANDWRITTEN_SIGNATURE";
  }
  return "ISSUED";
}
