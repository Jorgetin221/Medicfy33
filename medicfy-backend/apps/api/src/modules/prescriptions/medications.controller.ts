import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { medicationSearchQuerySchema } from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { PrismaService } from "../../prisma/prisma.service";

const searchQueryPipe = new ZodValidationPipe(medicationSearchQuerySchema);
const MAX_RESULTS = 20;

// Catálogo de medicamentos (sembrado parcialmente — ver el plan) para
// el panel de receta de DOC-06. Incluye controlGroup/
// isElectronicallyPrescribable a propósito: el frontend avisa ANTES
// de intentar prescribir un Grupo I/II (R5), en vez de dejar que el
// médico llene todo el formulario y reciba el bloqueo hasta el final.
@ApiTags("prescriptions")
@ApiBearerAuth()
@Controller("medications")
@UseGuards(JwtAuthGuard)
export class MedicationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiQuery({ name: "search", required: false })
  @ApiOperation({ summary: "Busca en el catálogo de medicamentos por nombre genérico o comercial" })
  async search(@Query("search") search: string | undefined) {
    const query = searchQueryPipe.transform({ search });
    return this.prisma.medicationCatalog.findMany({
      where: {
        isActive: true,
        ...(query.search
          ? {
              OR: [
                { genericName: { contains: query.search, mode: "insensitive" as const } },
                { brandNames: { has: query.search } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        genericName: true,
        brandNames: true,
        presentations: true,
        controlGroup: true,
        isElectronicallyPrescribable: true,
      },
      orderBy: { genericName: "asc" },
      take: MAX_RESULTS,
    });
  }
}
