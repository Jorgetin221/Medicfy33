import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../prisma/prisma.service";

// Not in §8.1's endpoint inventory — found missing while building
// Sprint 5c's doctor-registration screen (PUB-03): nothing in the
// spec gives the frontend a way to know which primarySpecialtyCode
// values are valid. Public and read-only, same visibility level as
// the specialty names doctors' public profiles already expose (M5b).
@ApiTags("specialties")
@Controller("specialties")
export class SpecialtiesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: "Catálogo de especialidades activas (público) — usado por el selector de registro de médico" })
  async list() {
    return this.prisma.specialty.findMany({
      where: { isActive: true },
      // id incluido desde Perfil (Parte B §5.1): la pantalla necesita
      // resolver Doctor.primarySpecialtyId a un nombre legible.
      select: { id: true, code: true, nameEs: true, requiresSpecialtyLicense: true },
      orderBy: { nameEs: "asc" },
    });
  }
}
