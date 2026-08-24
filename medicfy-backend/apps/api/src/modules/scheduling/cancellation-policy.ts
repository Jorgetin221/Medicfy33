export interface CancellationPolicy {
  fullRefundHoursBefore: number;
  partialRefundHoursBefore: number;
  partialRefundPercent: number;
}

// M5-RN-002 default: ">24 h → 100%; 2-24 h → 50%; <2 h o no-show → 0%".
export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = {
  fullRefundHoursBefore: 24,
  partialRefundHoursBefore: 2,
  partialRefundPercent: 50,
};

// M5-RN-002: "configurable por médico" — doctors.cancellationPolicy
// is NULL until a doctor overrides it, meaning the spec's own
// default applies.
export function resolveCancellationPolicy(doctorPolicy: unknown): CancellationPolicy {
  if (doctorPolicy && typeof doctorPolicy === "object") {
    return { ...DEFAULT_CANCELLATION_POLICY, ...(doctorPolicy as Partial<CancellationPolicy>) };
  }
  return DEFAULT_CANCELLATION_POLICY;
}

// Evaluated against the appointment's cancellationPolicySnapshot
// (M5-CA-003), never the doctor's current policy — "si el médico la
// cambia después, aplica la que el paciente aceptó".
export function refundPercentFor(policy: CancellationPolicy, now: Date, startsAt: Date): number {
  const hoursUntilStart = (startsAt.getTime() - now.getTime()) / (60 * 60 * 1000);
  if (hoursUntilStart > policy.fullRefundHoursBefore) {
    return 100;
  }
  if (hoursUntilStart >= policy.partialRefundHoursBefore) {
    return policy.partialRefundPercent;
  }
  return 0;
}
