import { HttpStatus, Injectable } from "@nestjs/common";
import type { PracticeLocation } from "@prisma/client";
import type { PracticeLocationInput, PracticeLocationUpdateInput } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { omitUndefined } from "../../../common/omit-undefined";

@Injectable()
export class PracticeLocationService {
  constructor(private readonly prisma: PrismaService) {}

  async list(doctorId: string): Promise<PracticeLocation[]> {
    return this.prisma.practiceLocation.findMany({ where: { doctorId }, orderBy: { createdAt: "asc" } });
  }

  async create(doctorId: string, input: PracticeLocationInput): Promise<PracticeLocation> {
    // `name` is required by the schema (unlike the rest of the
    // fields) — kept explicit so omitUndefined's all-optional mapped
    // type doesn't erase that guarantee for Prisma's create().
    const { name, ...optional } = input;
    return this.prisma.practiceLocation.create({ data: { doctorId, name, ...omitUndefined(optional) } });
  }

  async update(doctorId: string, locationId: string, input: PracticeLocationUpdateInput): Promise<PracticeLocation> {
    await this.assertOwnership(doctorId, locationId);
    return this.prisma.practiceLocation.update({ where: { id: locationId }, data: omitUndefined(input) });
  }

  async remove(doctorId: string, locationId: string): Promise<void> {
    await this.assertOwnership(doctorId, locationId);
    await this.prisma.practiceLocation.delete({ where: { id: locationId } });
  }

  private async assertOwnership(doctorId: string, locationId: string): Promise<void> {
    const location = await this.prisma.practiceLocation.findUnique({ where: { id: locationId } });
    if (!location || location.doctorId !== doctorId) {
      throw new ApiException("LOCATION_NOT_FOUND", "Consultorio no encontrado.", HttpStatus.NOT_FOUND);
    }
  }
}
