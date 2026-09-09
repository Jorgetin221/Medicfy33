import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { AdminGuard } from "../identity/guards/admin.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { getRequestMeta } from "../identity/request-meta";
import { SearchThrottle } from "../../common/rate-limit";
import { AdminAuditService } from "./services/admin-audit.service";

// M15-RN-002: verificación bajo demanda de la cadena de hashes de
// audit_log — sin contenido clínico (R2/M13-CA-001), mismo patrón que
// AdminMetricsController. @SearchThrottle: recorre audit_log completo
// (O(n)), mismo criterio que las demás búsquedas administrativas de
// M15-RN-010.
@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin/audit")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminAuditController {
  constructor(private readonly adminAuditService: AdminAuditService) {}

  @Get("chain-verification")
  @SearchThrottle()
  @ApiOperation({ summary: "M15-RN-002: verifica la cadena de hashes de audit_log — sin contenido clínico" })
  async verifyChain(@Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    return this.adminAuditService.verifyChain(user.sub, getRequestMeta(req));
  }
}
