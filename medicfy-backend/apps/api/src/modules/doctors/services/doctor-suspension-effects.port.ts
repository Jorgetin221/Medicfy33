// M2-RN-005: suspending a doctor must mark future appointments for
// reschedule, notify affected patients, and issue 100% refunds. M5
// (appointments) now exists — AppointmentCancellationSuspensionAdapter
// cancels the doctor's future paid appointments (100% refund
// entitlement, computed by AppointmentStateMachineService.cancel())
// and notifies patients. Real refund *issuance* (moving money) is
// still not implementable — M6 (payments) doesn't exist, see
// docs/CRITERIOS_DIFERIDOS.md. This port remains the seam so M6 can
// wire that in later without touching M2.
export interface DoctorSuspensionEffects {
  handleDoctorSuspended(
    doctorUserId: string,
    adminUserId: string
  ): Promise<{ notifiedPatients: number; refundsIssued: number }>;
}

export const DOCTOR_SUSPENSION_EFFECTS = Symbol("DOCTOR_SUSPENSION_EFFECTS");
