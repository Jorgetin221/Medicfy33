import { HttpStatus, Injectable } from "@nestjs/common";
import type { AvailabilityRule } from "@prisma/client";
import { timeOfDayToMinutes, type AvailabilityRuleCreateInput, type AvailabilityRuleUpdateInput } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { omitUndefined } from "../../../common/omit-undefined";

interface OverlapCandidate {
  modality: AvailabilityRule["modality"];
  weekday: number;
  startMinute: number;
  endMinute: number;
  validFrom: Date;
  validUntil: Date | null;
  excludeRuleId: string | null;
}

// Two [from, until] date ranges overlap unless one ends before the
// other starts — a null `until` means open-ended (never ends).
function dateRangesOverlap(aFrom: Date, aUntil: Date | null, bFrom: Date, bUntil: Date | null): boolean {
  const aStartsBeforeBEnds = bUntil === null || aFrom <= bUntil;
  const bStartsBeforeAEnds = aUntil === null || bFrom <= aUntil;
  return aStartsBeforeBEnds && bStartsBeforeAEnds;
}

@Injectable()
export class AvailabilityRuleService {
  constructor(private readonly prisma: PrismaService) {}

  async list(doctorId: string): Promise<AvailabilityRule[]> {
    return this.prisma.availabilityRule.findMany({
      where: { doctorId },
      orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
    });
  }

  // M4-RN-004: reglas solapadas del mismo médico y modalidad se
  // rechazan al guardar, con indicación del conflicto (409 +
  // conflictingRuleId). "Validaciones": start_time < end_time is
  // already enforced by the Zod schema before this runs.
  async create(doctorId: string, input: AvailabilityRuleCreateInput): Promise<AvailabilityRule> {
    const startMinute = timeOfDayToMinutes(input.startTime);
    const endMinute = timeOfDayToMinutes(input.endTime);
    const validFrom = new Date(input.validFrom);
    const validUntil = input.validUntil ? new Date(input.validUntil) : null;

    await this.assertNoOverlap(doctorId, {
      modality: input.modality,
      weekday: input.weekday,
      startMinute,
      endMinute,
      validFrom,
      validUntil,
      excludeRuleId: null,
    });

    return this.prisma.availabilityRule.create({
      data: {
        doctorId,
        locationId: input.locationId ?? null,
        modality: input.modality,
        weekday: input.weekday,
        startMinute,
        endMinute,
        slotDurationMinutes: input.slotDurationMinutes,
        bufferMinutes: input.bufferMinutes ?? 0,
        validFrom,
        validUntil,
      },
    });
  }

  async update(doctorId: string, ruleId: string, patch: AvailabilityRuleUpdateInput): Promise<AvailabilityRule> {
    const existing = await this.prisma.availabilityRule.findFirst({ where: { id: ruleId, doctorId } });
    if (!existing) {
      throw new ApiException("AVAILABILITY_RULE_NOT_FOUND", "Regla de disponibilidad no encontrada.", HttpStatus.NOT_FOUND);
    }

    const willBeActive = patch.isActive ?? existing.isActive;
    if (willBeActive) {
      await this.assertNoOverlap(doctorId, {
        modality: patch.modality ?? existing.modality,
        weekday: patch.weekday ?? existing.weekday,
        startMinute: patch.startTime ? timeOfDayToMinutes(patch.startTime) : existing.startMinute,
        endMinute: patch.endTime ? timeOfDayToMinutes(patch.endTime) : existing.endMinute,
        validFrom: patch.validFrom ? new Date(patch.validFrom) : existing.validFrom,
        validUntil: patch.validUntil ? new Date(patch.validUntil) : existing.validUntil,
        excludeRuleId: ruleId,
      });
    }

    return this.prisma.availabilityRule.update({
      where: { id: ruleId },
      data: omitUndefined({
        locationId: patch.locationId,
        modality: patch.modality,
        weekday: patch.weekday,
        startMinute: patch.startTime ? timeOfDayToMinutes(patch.startTime) : undefined,
        endMinute: patch.endTime ? timeOfDayToMinutes(patch.endTime) : undefined,
        slotDurationMinutes: patch.slotDurationMinutes,
        bufferMinutes: patch.bufferMinutes,
        validFrom: patch.validFrom ? new Date(patch.validFrom) : undefined,
        validUntil: patch.validUntil ? new Date(patch.validUntil) : undefined,
        isActive: patch.isActive,
      }),
    });
  }

  async delete(doctorId: string, ruleId: string): Promise<void> {
    const existing = await this.prisma.availabilityRule.findFirst({ where: { id: ruleId, doctorId } });
    if (!existing) {
      throw new ApiException("AVAILABILITY_RULE_NOT_FOUND", "Regla de disponibilidad no encontrada.", HttpStatus.NOT_FOUND);
    }
    // M4 "Casos límite": borrar una regla con citas futuras exige el
    // mismo tratamiento que M4-RN-006 (listar afectadas, exigir
    // decisión explícita). No construido aquí — depende de
    // `appointments`, que M4 no incluye (ver scheduling.module.ts).
    // Sin riesgo por ahora: ningún appointment puede existir todavía.
    await this.prisma.availabilityRule.delete({ where: { id: ruleId } });
  }

  private async assertNoOverlap(doctorId: string, candidate: OverlapCandidate): Promise<void> {
    const sameSlot = await this.prisma.availabilityRule.findMany({
      where: {
        doctorId,
        modality: candidate.modality,
        weekday: candidate.weekday,
        isActive: true,
        ...(candidate.excludeRuleId ? { id: { not: candidate.excludeRuleId } } : {}),
      },
    });

    const conflict = sameSlot.find((rule) => {
      const timeOverlaps = candidate.startMinute < rule.endMinute && rule.startMinute < candidate.endMinute;
      return timeOverlaps && dateRangesOverlap(candidate.validFrom, candidate.validUntil, rule.validFrom, rule.validUntil);
    });

    if (conflict) {
      throw new ApiException(
        "AVAILABILITY_RULE_OVERLAP",
        "Esta regla se traslapa con una regla existente del mismo médico y modalidad.",
        HttpStatus.CONFLICT,
        { conflictingRuleId: conflict.id }
      );
    }
  }
}
