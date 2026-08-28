import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { TreatmentProtocolService } from "./services/treatment-protocol.service";

// Fase 7 · Prompt 47A: catálogo de protocolos activos — sembrado
// (curación), no algo que un médico cree en vivo. Sin
// CareRelationshipGuard: no es un dato de un paciente específico,
// mismo criterio que Icd10Controller.
@ApiTags("protocols")
@ApiBearerAuth()
@Controller("protocols")
@UseGuards(JwtAuthGuard)
export class ProtocolsController {
  constructor(private readonly protocols: TreatmentProtocolService) {}

  @Get()
  @ApiOperation({ summary: "Prompt 47A: protocolos activos disponibles para iniciar una instancia" })
  async listActive() {
    return this.protocols.listActive();
  }
}
