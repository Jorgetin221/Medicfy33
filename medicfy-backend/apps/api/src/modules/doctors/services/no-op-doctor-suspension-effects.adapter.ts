import { Injectable, Logger } from "@nestjs/common";
import type { DoctorSuspensionEffects } from "./doctor-suspension-effects.port";

// Placeholder until M5 (appointments) and M6 (payments) exist. Logs
// loudly rather than silently claiming patients were notified.
@Injectable()
export class NoOpDoctorSuspensionEffectsAdapter implements DoctorSuspensionEffects {
  private readonly logger = new Logger(NoOpDoctorSuspensionEffectsAdapter.name);

  async handleDoctorSuspended(doctorUserId: string): Promise<{ notifiedPatients: number; refundsIssued: number }> {
    this.logger.warn(
      `[not implemented] doctor ${doctorUserId} suspended — appointment reschedule, patient notification, and refunds are M5/M6 work, not yet built.`
    );
    return { notifiedPatients: 0, refundsIssued: 0 };
  }
}
