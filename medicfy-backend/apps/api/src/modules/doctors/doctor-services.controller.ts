import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  doctorServiceSchema,
  doctorServiceUpdateSchema,
  type DoctorServiceInput,
  type DoctorServiceUpdateInput,
} from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { DoctorProfileService } from "./services/doctor-profile.service";
import { ServiceOfferingService } from "./services/service-offering.service";

@ApiTags("doctors")
@ApiBearerAuth()
@Controller("doctors/me/services")
@UseGuards(JwtAuthGuard)
export class DoctorServicesController {
  constructor(
    private readonly doctorProfileService: DoctorProfileService,
    private readonly serviceOfferingService: ServiceOfferingService
  ) {}

  @Get()
  @ApiOperation({ summary: "M2-RN-003: incluye precio — solo visible al médico dueño, nunca en respuesta pública" })
  async list(@Req() req: Request) {
    const doctor = await this.currentDoctor(req);
    return this.serviceOfferingService.list(doctor.id);
  }

  @Post()
  @ApiOperation({ summary: "Crea un servicio con precio (1-99,999 MXN, privado por defecto)" })
  async create(@Body(new ZodValidationPipe(doctorServiceSchema)) body: DoctorServiceInput, @Req() req: Request) {
    const doctor = await this.currentDoctor(req);
    return this.serviceOfferingService.create(doctor.id, body);
  }

  // DT-02: see practice-locations.controller.ts's update() for why the
  // pipe is bound to @Body() directly rather than via @UsePipes.
  @Patch(":id")
  @ApiOperation({ summary: "Actualiza un servicio" })
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(doctorServiceUpdateSchema)) body: DoctorServiceUpdateInput,
    @Req() req: Request
  ) {
    const doctor = await this.currentDoctor(req);
    return this.serviceOfferingService.update(doctor.id, id, body);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Elimina un servicio" })
  async remove(@Param("id") id: string, @Req() req: Request) {
    const doctor = await this.currentDoctor(req);
    await this.serviceOfferingService.remove(doctor.id, id);
    return { removed: true };
  }

  private async currentDoctor(req: Request) {
    const { user } = req as AuthenticatedRequest;
    return this.doctorProfileService.getOwnProfile(user.sub);
  }
}
