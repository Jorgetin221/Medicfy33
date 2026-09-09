import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { AdminGuard } from "../identity/guards/admin.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { getRequestMeta } from "../identity/request-meta";
import { AdminUsersService } from "./services/admin-users.service";
import { SearchThrottle } from "../../common/rate-limit";

// M13: "búsqueda y gestión de usuarios". Alcance de esta primera
// versión: búsqueda de identidad (médicos + pacientes), sin acciones
// de gestión todavía — ninguna regla de negocio del §M13 define una
// acción de "gestión" sobre un paciente (a diferencia de médicos, que
// ya tienen verify/reject/suspend en admin-doctors.controller.ts).
@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin/users")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminUsersController {
  constructor(private readonly usersService: AdminUsersService) {}

  @SearchThrottle()
  @Get()
  @ApiQuery({ name: "q", required: false, description: "Nombre, cédula, Medicfy ID o correo" })
  @ApiOperation({ summary: "M13: búsqueda de médicos y pacientes por identificación — sin contenido clínico (M13-CA-001)" })
  async search(@Query("q") q: string | undefined, @Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    return this.usersService.search(q ?? "", user.sub, getRequestMeta(req));
  }
}
