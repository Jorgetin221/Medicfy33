import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { AdminGuard } from "../identity/guards/admin.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { getRequestMeta } from "../identity/request-meta";
import { AdminMetricsService } from "./services/admin-metrics.service";

// M13-RN-005. MRR y churn quedan fuera (null explícito, ver el
// servicio) porque M6 (facturación) todavía no existe — no hay dato
// real que reportar, y no se inventa uno.
@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin/metrics")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminMetricsController {
  constructor(private readonly metricsService: AdminMetricsService) {}

  @Get()
  @ApiOperation({ summary: "M13-RN-005: métricas operativas del MVP — sin contenido clínico (M13-CA-001)" })
  async getMetrics(@Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    return this.metricsService.getMetrics(user.sub, getRequestMeta(req));
  }
}
