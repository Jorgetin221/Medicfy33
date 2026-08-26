import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { NOTIFICATION_PORT, type NotificationPort } from "../../identity/services/notification.port";
import { AppointmentStateMachineService } from "../../scheduling/services/appointment-state-machine.service";
import type { DoctorSuspensionEffects } from "./doctor-suspension-effects.port";

// M2-RN-005: cancela las citas futuras y pagadas del médico
// suspendido (SCHEDULED/CONFIRMED — PENDING_PAYMENT no admite
// CANCELLED_BY_DOCTOR en la máquina de estados, y de cualquier forma
// se libera sola a los 30 minutos por M5-CA-002) y notifica a cada
// paciente afectado. AppointmentStateMachineService.cancel() con
// cancelledAsRole="DOCTOR" ya calcula 100% de reembolso — ese número
// viaja en la notificación. No se emite un reembolso real: no hay
// pasarela de pago (M6 no existe, confirmado — confirmPayment() solo
// cambia un status). Ver docs/CRITERIOS_DIFERIDOS.md.
@Injectable()
export class AppointmentCancellationSuspensionAdapter implements DoctorSuspensionEffects {
  private readonly logger = new Logger(AppointmentCancellationSuspensionAdapter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly appointmentStateMachine: AppointmentStateMachineService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort
  ) {}

  async handleDoctorSuspended(doctorUserId: string, adminUserId: string): Promise<{ notifiedPatients: number; refundsIssued: number }> {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId: doctorUserId } });
    if (!doctor) {
      return { notifiedPatients: 0, refundsIssued: 0 };
    }

    const affected = await this.prisma.appointment.findMany({
      where: { doctorId: doctor.id, status: { in: ["SCHEDULED", "CONFIRMED"] }, startsAt: { gt: new Date() } },
      include: { patient: { select: { email: true } } },
    });

    let notifiedPatients = 0;
    for (const appointment of affected) {
      const { refundPercent } = await this.appointmentStateMachine.cancel(
        appointment.id,
        adminUserId,
        "DOCTOR",
        "Médico suspendido — cuenta suspendida por administración"
      );
      await this.notifications.sendAppointmentCancelledDoctorSuspended(appointment.patient.email, {
        appointmentStartsAt: appointment.startsAt,
        refundPercent,
      });
      notifiedPatients++;
    }

    if (affected.length > 0) {
      this.logger.warn(
        `[not implemented] doctor ${doctorUserId} suspended — ${affected.length} appointment(s) cancelled and ${notifiedPatients} patient notification(s) sent with 100% refund entitlement, but no payment was ever captured for them (M6 doesn't exist), so no money moves.`
      );
    }

    return { notifiedPatients, refundsIssued: 0 };
  }
}
