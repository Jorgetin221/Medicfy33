import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  practiceLocationSchema,
  practiceLocationUpdateSchema,
  type PracticeLocationInput,
  type PracticeLocationUpdateInput,
} from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { DoctorProfileService } from "./services/doctor-profile.service";
import { PracticeLocationService } from "./services/practice-location.service";

@ApiTags("doctors")
@ApiBearerAuth()
@Controller("doctors/me/locations")
@UseGuards(JwtAuthGuard)
export class PracticeLocationsController {
  constructor(
    private readonly doctorProfileService: DoctorProfileService,
    private readonly locationService: PracticeLocationService
  ) {}

  @Get()
  @ApiOperation({ summary: "Lista los consultorios del médico autenticado" })
  async list(@Req() req: Request) {
    const doctor = await this.currentDoctor(req);
    return this.locationService.list(doctor.id);
  }

  @Post()
  @ApiOperation({ summary: "M2-RN-004: se necesita >=1 consultorio activo o teleconsulta para recibir citas" })
  async create(@Body(new ZodValidationPipe(practiceLocationSchema)) body: PracticeLocationInput, @Req() req: Request) {
    const doctor = await this.currentDoctor(req);
    return this.locationService.create(doctor.id, body);
  }

  // DT-02: ZodValidationPipe bound to @Body() directly, not via
  // @UsePipes at the method level — this handler also has
  // @Param("id"), and a method-level pipe validates every handler
  // parameter, not just @Body() (the bug already found and fixed in
  // POST /admin/doctors/:id/reject).
  @Patch(":id")
  @ApiOperation({ summary: "Actualiza un consultorio" })
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(practiceLocationUpdateSchema)) body: PracticeLocationUpdateInput,
    @Req() req: Request
  ) {
    const doctor = await this.currentDoctor(req);
    return this.locationService.update(doctor.id, id, body);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Elimina un consultorio" })
  async remove(@Param("id") id: string, @Req() req: Request) {
    const doctor = await this.currentDoctor(req);
    await this.locationService.remove(doctor.id, id);
    return { removed: true };
  }

  private async currentDoctor(req: Request) {
    const { user } = req as AuthenticatedRequest;
    return this.doctorProfileService.getOwnProfile(user.sub);
  }
}
