import { HttpStatus, Injectable } from "@nestjs/common";
import type { AvailabilityException } from "@prisma/client";
import type { AvailabilityExceptionCreateInput } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { NON_OCCUPYING_APPOINTMENT_STATUSES } from "../appointment-status";

@Injectable()
export class AvailabilityExceptionService {
  constructor(private readonly prisma: PrismaService) {}

  async list(doctorId: string): Promise<AvailabilityException[]> {
    return this.prisma.availabilityException.findMany({
      where: { doctorId },
      orderBy: { startAt: "asc" },
    });
  }

  // M4-RN-006/M4-CA-003: "nunca cancela citas en silencio... lista las
  // citas afectadas y exige que el médico decida". Implemented for
  // real now that `appointments` exists (M5a) — rejects the exception
  // (409) if it overlaps any active appointment, returning the
  // affected appointment IDs so the doctor can resolve each one via
  // the (also now real) cancel/reschedule endpoints first, then retry.
  // Never auto-cancels anything itself.
  async create(doctorId: string, input: AvailabilityExceptionCreateInput): Promise<AvailabilityException> {
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);

    const affected = await this.prisma.appointment.findMany({
      where: {
        doctorId,
        status: { notIn: [...NON_OCCUPYING_APPOINTMENT_STATUSES] },
        startsAt: { lt: endAt },
        endsAt: { gt: startAt },
      },
      select: { id: true, startsAt: true, endsAt: true, patientId: true },
    });

    if (affected.length > 0) {
      throw new ApiException(
        "AVAILABILITY_EXCEPTION_HAS_AFFECTED_APPOINTMENTS",
        "Este bloqueo afecta citas ya agendadas. Cancélalas o reagéndalas antes de crear el bloqueo.",
        HttpStatus.CONFLICT,
        { affectedAppointments: affected }
      );
    }

    return this.prisma.availabilityException.create({
      data: {
        doctorId,
        startAt,
        endAt,
        reason: input.reason ?? null,
        blocksAllDay: input.blocksAllDay ?? false,
      },
    });
  }

  async delete(doctorId: string, exceptionId: string): Promise<void> {
    const existing = await this.prisma.availabilityException.findFirst({ where: { id: exceptionId, doctorId } });
    if (!existing) {
      throw new ApiException("AVAILABILITY_EXCEPTION_NOT_FOUND", "Excepción no encontrada.", HttpStatus.NOT_FOUND);
    }
    await this.prisma.availabilityException.delete({ where: { id: exceptionId } });
  }
}
