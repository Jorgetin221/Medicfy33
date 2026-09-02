import { HttpStatus, Injectable } from "@nestjs/common";
import type { DoctorService as DoctorServiceOffering } from "@prisma/client";
import type { DoctorServiceInput, DoctorServiceUpdateInput } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { omitUndefined } from "../../../common/omit-undefined";
import { toPublicServiceView, type PublicServiceView } from "../doctor-public-view";

// Named "ServiceOffering" (not "DoctorService") to avoid colliding
// with the Prisma model name and NestJS's own DI vocabulary.
@Injectable()
export class ServiceOfferingService {
  constructor(private readonly prisma: PrismaService) {}

  async list(doctorId: string): Promise<DoctorServiceOffering[]> {
    return this.prisma.doctorService.findMany({ where: { doctorId }, orderBy: { createdAt: "asc" } });
  }

  // M5-RN-007: solo servicios activos, y nunca priceMxnCents —
  // toPublicServiceView es el único lugar que decide la forma de un
  // servicio público (GET /doctors/:slug/public/services, sin guard).
  async listPublicBySlug(slug: string): Promise<PublicServiceView[]> {
    const doctor = await this.prisma.doctor.findUnique({ where: { slug } });
    if (!doctor) {
      throw new ApiException("DOCTOR_NOT_FOUND", "Médico no encontrado.", HttpStatus.NOT_FOUND);
    }
    const services = await this.prisma.doctorService.findMany({
      where: { doctorId: doctor.id, isActive: true },
      orderBy: { createdAt: "asc" },
    });
    return services.map(toPublicServiceView);
  }

  async create(doctorId: string, input: DoctorServiceInput): Promise<DoctorServiceOffering> {
    if (input.locationId) {
      await this.assertLocationOwnership(doctorId, input.locationId);
    }
    return this.prisma.doctorService.create({
      data: {
        doctorId,
        locationId: input.locationId ?? null,
        serviceType: input.serviceType,
        name: input.name,
        durationMinutes: input.durationMinutes,
        priceMxnCents: input.priceMxn * 100,
        ...omitUndefined({ priceVisibility: input.priceVisibility, isActive: input.isActive }),
      },
    });
  }

  async update(doctorId: string, serviceId: string, input: DoctorServiceUpdateInput): Promise<DoctorServiceOffering> {
    await this.assertOwnership(doctorId, serviceId);
    if (input.locationId) {
      await this.assertLocationOwnership(doctorId, input.locationId);
    }
    return this.prisma.doctorService.update({
      where: { id: serviceId },
      data: omitUndefined({
        locationId: input.locationId,
        serviceType: input.serviceType,
        name: input.name,
        durationMinutes: input.durationMinutes,
        priceMxnCents: input.priceMxn !== undefined ? input.priceMxn * 100 : undefined,
        priceVisibility: input.priceVisibility,
        isActive: input.isActive,
      }),
    });
  }

  async remove(doctorId: string, serviceId: string): Promise<void> {
    await this.assertOwnership(doctorId, serviceId);
    await this.prisma.doctorService.delete({ where: { id: serviceId } });
  }

  private async assertOwnership(doctorId: string, serviceId: string): Promise<void> {
    const service = await this.prisma.doctorService.findUnique({ where: { id: serviceId } });
    if (!service || service.doctorId !== doctorId) {
      throw new ApiException("SERVICE_NOT_FOUND", "Servicio no encontrado.", HttpStatus.NOT_FOUND);
    }
  }

  private async assertLocationOwnership(doctorId: string, locationId: string): Promise<void> {
    const location = await this.prisma.practiceLocation.findUnique({ where: { id: locationId } });
    if (!location || location.doctorId !== doctorId) {
      throw new ApiException("LOCATION_NOT_FOUND", "Consultorio no encontrado.", HttpStatus.BAD_REQUEST);
    }
  }
}
