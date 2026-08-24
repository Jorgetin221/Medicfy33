// M2-RN-005: suspending a doctor must mark future appointments for
// reschedule, notify affected patients, and issue 100% refunds. None
// of that is implementable yet — Appointment (M5) and Payment (M6)
// don't exist. This port is the seam DoctorVerificationService calls
// through, so M5/M6 can implement the real logic without touching M2.
export interface DoctorSuspensionEffects {
  handleDoctorSuspended(doctorUserId: string): Promise<{ notifiedPatients: number; refundsIssued: number }>;
}

export const DOCTOR_SUSPENSION_EFFECTS = Symbol("DOCTOR_SUSPENSION_EFFECTS");
