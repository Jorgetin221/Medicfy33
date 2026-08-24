import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { Doctor } from "@prisma/client";
import { availabilityExceptionCreateSchema, type AvailabilityExceptionCreateInput } from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { SchedulingAuthService } from "./services/scheduling-auth.service";
import { AvailabilityExceptionService } from "./services/availability-exception.service";

// §8.1: GET/POST/DELETE only — no PATCH listed for
// /doctors/me/availability-exceptions.
@ApiTags("scheduling")
@ApiBearerAuth()
@Controller("doctors/me/availability-exceptions")
@UseGuards(JwtAuthGuard)
export class AvailabilityExceptionsController {
  constructor(
    private readonly schedulingAuth: SchedulingAuthService,
    private readonly exceptionService: AvailabilityExceptionService
  ) {}

  @Get()
  @ApiOperation({ summary: "Lista bloqueos y vacaciones del médico (DOCTOR o su ASSISTANT)" })
  async list(@Req() req: Request) {
    const doctor = await this.actingDoctor(req);
    return this.exceptionService.list(doctor.id);
  }

  @Post()
  @ApiOperation({ summary: "Crea un bloqueo/vacación (máx. 365 días; 409 si afecta citas activas, M4-RN-006)" })
  async create(@Body(new ZodValidationPipe(availabilityExceptionCreateSchema)) body: AvailabilityExceptionCreateInput, @Req() req: Request) {
    const doctor = await this.actingDoctor(req);
    return this.exceptionService.create(doctor.id, body);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Elimina un bloqueo/vacación" })
  async remove(@Param("id") id: string, @Req() req: Request) {
    const doctor = await this.actingDoctor(req);
    await this.exceptionService.delete(doctor.id, id);
    return { removed: true };
  }

  private async actingDoctor(req: Request): Promise<Doctor> {
    const { user } = req as AuthenticatedRequest;
    return this.schedulingAuth.resolveActingDoctor(user.sub);
  }
}
