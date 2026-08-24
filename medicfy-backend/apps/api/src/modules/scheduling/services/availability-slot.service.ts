import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { zonedDateAndMinutesToUtc } from "../timezone";
import { modalityForServiceType } from "../service-modality";
import { NON_OCCUPYING_APPOINTMENT_STATUSES } from "../appointment-status";

export interface AvailableSlot {
  startAt: string;
  endAt: string;
  locationId: string | null;
}

// from/to son opcionales solo en el contrato de la petición HTTP
// (AvailabilityQueryInput, resuelto por AvailabilityController cuando
// el cliente los omite) — este servicio siempre necesita un rango
// concreto para su aritmética de fechas.
export interface ResolvedAvailabilityQuery {
  from: string;
  to: string;
  service_id: string;
}

function dateOnlyUtc(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

function eachDateInRange(fromStr: string, toStr: string): string[] {
  const dates: string[] = [];
  let cursor = dateOnlyUtc(fromStr);
  const end = dateOnlyUtc(toStr);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return dates;
}

// M4-RN-001/002/003/005/007 + M4-CA-004. Espacios = availability_rules
// − availability_exceptions − appointments activas − buffer_minutes,
// recortados por antelación mínima y ventana máxima (M4-RN-005). Los
// tres términos de M4-RN-002 están completos desde M5a — antes de
// M5a, el tercero (appointments) era un seam vacío porque la tabla no
// existía.
@Injectable()
export class AvailabilitySlotService {
  constructor(private readonly prisma: PrismaService) {}

  async computeSlots(doctorId: string, query: ResolvedAvailabilityQuery): Promise<AvailableSlot[]> {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) {
      throw new ApiException("DOCTOR_NOT_FOUND", "Médico no encontrado.", HttpStatus.NOT_FOUND);
    }

    const service = await this.prisma.doctorService.findFirst({
      where: { id: query.service_id, doctorId, isActive: true },
    });
    if (!service) {
      throw new ApiException("SERVICE_NOT_FOUND", "Servicio no encontrado para este médico.", HttpStatus.NOT_FOUND);
    }

    const requiredModality = modalityForServiceType(service.serviceType);

    const now = new Date();
    const earliestAllowed = new Date(now.getTime() + doctor.minBookingNoticeMinutes * 60_000);
    const latestAllowed = new Date(now.getTime() + doctor.maxBookingWindowDays * 24 * 60 * 60_000);

    const rangeStart = zonedDateAndMinutesToUtc(query.from, 0);
    const rangeEndExclusive = zonedDateAndMinutesToUtc(query.to, 24 * 60);

    const [rules, exceptions, activeAppointments] = await Promise.all([
      this.prisma.availabilityRule.findMany({ where: { doctorId, modality: requiredModality, isActive: true } }),
      this.prisma.availabilityException.findMany({
        where: { doctorId, startAt: { lt: rangeEndExclusive }, endAt: { gt: rangeStart } },
      }),
      // M4-RN-002's "− appointments activas" term — the seam this
      // comment used to describe is closed now that M5a's
      // appointments table exists. Same status set the DB's own
      // EXCLUDE constraint uses (appointment-status.ts).
      this.prisma.appointment.findMany({
        where: {
          doctorId,
          status: { notIn: [...NON_OCCUPYING_APPOINTMENT_STATUSES] },
          startsAt: { lt: rangeEndExclusive },
          endsAt: { gt: rangeStart },
        },
      }),
    ]);

    const slots: AvailableSlot[] = [];
    for (const dateStr of eachDateInRange(query.from, query.to)) {
      const weekday = dateOnlyUtc(dateStr).getUTCDay();
      const day = dateOnlyUtc(dateStr);
      const rulesForDay = rules.filter(
        (rule) => rule.weekday === weekday && rule.validFrom <= day && (rule.validUntil === null || day <= rule.validUntil)
      );

      for (const rule of rulesForDay) {
        // M4-RN-003: el largo del espacio es la duración del
        // servicio, no rule.slotDurationMinutes — ese campo es solo
        // la granularidad de la rejilla de horas de inicio posibles.
        for (
          let start = rule.startMinute;
          start + service.durationMinutes + rule.bufferMinutes <= rule.endMinute;
          start += rule.slotDurationMinutes
        ) {
          const startAt = zonedDateAndMinutesToUtc(dateStr, start);
          const endAt = zonedDateAndMinutesToUtc(dateStr, start + service.durationMinutes);

          if (startAt < earliestAllowed || startAt > latestAllowed) continue;
          if (startAt < rangeStart || startAt >= rangeEndExclusive) continue;

          const blockedByException = exceptions.some((exception) => startAt < exception.endAt && exception.startAt < endAt);
          if (blockedByException) continue;

          const blockedByAppointment = activeAppointments.some(
            (appointment) => startAt < appointment.endsAt && appointment.startsAt < endAt
          );
          if (blockedByAppointment) continue;

          slots.push({ startAt: startAt.toISOString(), endAt: endAt.toISOString(), locationId: rule.locationId });
        }
      }
    }

    slots.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return slots;
  }
}
