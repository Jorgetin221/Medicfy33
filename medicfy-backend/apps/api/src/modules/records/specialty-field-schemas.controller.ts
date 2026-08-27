import { Controller, Get, HttpStatus, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { SpecialtyFieldSection } from "@prisma/client";
import { ApiException } from "../../common/api-exception";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { SchedulingAuthService } from "../scheduling/services/scheduling-auth.service";
import { SpecialtyScaleService } from "./services/specialty-scale.service";

const VALID_SECTIONS = Object.values(SpecialtyFieldSection);

// Lectura de SpecialtyFieldSchema (M8-RN-014) — sin CareRelationshipGuard,
// no es dato de un paciente (mismo criterio que GET /icd10). Usa
// resolveActingDoctor() (SchedulingAuthService) para que un ASSISTANT
// que llena la consulta por su médico también resuelva la especialidad
// correcta, no solo el propio DOCTOR.
@ApiTags("records")
@ApiBearerAuth()
@Controller("specialty-field-schemas")
@UseGuards(JwtAuthGuard)
export class SpecialtyFieldSchemasController {
  constructor(
    private readonly schedulingAuth: SchedulingAuthService,
    private readonly scales: SpecialtyScaleService
  ) {}

  @Get()
  @ApiQuery({ name: "section", enum: VALID_SECTIONS })
  @ApiOperation({ summary: "Campos activos de la sección pedida para la especialidad del médico actuante (hoy: ESCALAS — Glasgow, Apgar)" })
  async list(@Query("section") section: string, @Req() req: Request) {
    if (!VALID_SECTIONS.includes(section as SpecialtyFieldSection)) {
      throw new ApiException("VALIDATION_ERROR", `section debe ser uno de: ${VALID_SECTIONS.join(", ")}.`, HttpStatus.BAD_REQUEST);
    }
    const { user } = req as AuthenticatedRequest;
    const doctor = await this.schedulingAuth.resolveActingDoctor(user.sub);
    return this.scales.listActiveFields(doctor.primarySpecialtyId, section as SpecialtyFieldSection);
  }
}
