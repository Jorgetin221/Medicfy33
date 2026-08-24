import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { icd10SearchQuerySchema } from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { PrismaService } from "../../prisma/prisma.service";

const searchQueryPipe = new ZodValidationPipe(icd10SearchQuerySchema);
const MAX_RESULTS = 20;

// Catálogo CIE-10 (OMS/DOF, sembrado parcialmente — ver el plan) para
// el selector de diagnóstico de DOC-06. Público entre usuarios
// autenticados, sin CareRelationshipGuard: no es dato de un paciente.
@ApiTags("records")
@ApiBearerAuth()
@Controller("icd10")
@UseGuards(JwtAuthGuard)
export class Icd10Controller {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiQuery({ name: "search", required: false })
  @ApiOperation({ summary: "Busca en el catálogo CIE-10 por código o descripción" })
  async search(@Query("search") search: string | undefined) {
    const query = searchQueryPipe.transform({ search });
    return this.prisma.icd10Code.findMany({
      where: {
        isActive: true,
        ...(query.search
          ? {
              OR: [
                { code: { contains: query.search, mode: "insensitive" as const } },
                { description: { contains: query.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { code: "asc" },
      take: MAX_RESULTS,
    });
  }
}
