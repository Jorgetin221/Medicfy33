import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { antecedentesTemplateCreateSchema, type AntecedentesTemplateCreateInput } from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { AntecedentesTemplateService } from "./services/antecedentes-template.service";

// Prompt 23B: plantillas de antecedentes del médico (por especialidad
// y perfil). No son datos de un paciente — sin CareRelationshipGuard,
// pero SIEMPRE acotadas al médico dueño.
@ApiTags("records")
@ApiBearerAuth()
@Controller("records/antecedentes-templates")
@UseGuards(JwtAuthGuard)
export class AntecedentesTemplatesController {
  constructor(private readonly templates: AntecedentesTemplateService) {}

  @Get()
  @ApiOperation({ summary: "Plantillas de antecedentes del médico autenticado" })
  async list(@Req() req: AuthenticatedRequest) {
    return this.templates.list(req.user.sub);
  }

  @Post()
  @ApiOperation({ summary: "Crea una plantilla — sus subtipos se validan contra el catálogo" })
  async create(
    @Body(new ZodValidationPipe(antecedentesTemplateCreateSchema)) body: AntecedentesTemplateCreateInput,
    @Req() req: AuthenticatedRequest
  ) {
    return this.templates.create(req.user.sub, body);
  }
}
