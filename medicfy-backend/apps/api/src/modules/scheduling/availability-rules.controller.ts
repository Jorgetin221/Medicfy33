import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { Doctor } from "@prisma/client";
import {
  availabilityRuleCreateSchema,
  availabilityRuleUpdateSchema,
  type AvailabilityRuleCreateInput,
  type AvailabilityRuleUpdateInput,
} from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { SchedulingAuthService } from "./services/scheduling-auth.service";
import { AvailabilityRuleService } from "./services/availability-rule.service";

@ApiTags("scheduling")
@ApiBearerAuth()
@Controller("doctors/me/availability-rules")
@UseGuards(JwtAuthGuard)
export class AvailabilityRulesController {
  constructor(
    private readonly schedulingAuth: SchedulingAuthService,
    private readonly ruleService: AvailabilityRuleService
  ) {}

  @Get()
  @ApiOperation({ summary: "Lista las reglas de disponibilidad del médico (DOCTOR o su ASSISTANT)" })
  async list(@Req() req: Request) {
    const doctor = await this.actingDoctor(req);
    return this.ruleService.list(doctor.id);
  }

  @Post()
  @ApiOperation({ summary: "M4-RN-004: rechaza (409) reglas solapadas del mismo médico y modalidad" })
  async create(@Body(new ZodValidationPipe(availabilityRuleCreateSchema)) body: AvailabilityRuleCreateInput, @Req() req: Request) {
    const doctor = await this.actingDoctor(req);
    return this.ruleService.create(doctor.id, body);
  }

  // ZodValidationPipe bound to @Body() directly, not via @UsePipes at
  // the method level — this handler also has @Param("id"), and a
  // method-level pipe validates every handler parameter, not just
  // @Body() (the same bug already found and fixed in
  // POST /admin/doctors/:id/reject).
  @Patch(":id")
  @ApiOperation({ summary: "Actualiza una regla; re-valida el traslape (M4-RN-004) si sigue activa" })
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(availabilityRuleUpdateSchema)) body: AvailabilityRuleUpdateInput,
    @Req() req: Request
  ) {
    const doctor = await this.actingDoctor(req);
    return this.ruleService.update(doctor.id, id, body);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Elimina una regla de disponibilidad" })
  async remove(@Param("id") id: string, @Req() req: Request) {
    const doctor = await this.actingDoctor(req);
    await this.ruleService.delete(doctor.id, id);
    return { removed: true };
  }

  private async actingDoctor(req: Request): Promise<Doctor> {
    const { user } = req as AuthenticatedRequest;
    return this.schedulingAuth.resolveActingDoctor(user.sub);
  }
}
