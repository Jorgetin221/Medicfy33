import { Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { CuratorGuard } from "../catalog/guards/curator.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { AuditService } from "../identity/services/audit.service";
import { getRequestMeta } from "../identity/request-meta";
import { LabReferenceRangeService } from "./services/lab-reference-range.service";

// Capa 2 (v2.5) — bandeja de curaduría. Reutiliza CuratorGuard tal
// cual (modules/catalog/guards/curator.guard.ts): mismo chequeo de
// rol que la curaduría de vocabularios, sin dependencias propias que
// justifiquen una guardia nueva.
@ApiTags("labs")
@ApiBearerAuth()
@Controller("lab-reference-ranges")
@UseGuards(JwtAuthGuard, CuratorGuard)
export class LabReferenceRangesController {
  constructor(
    private readonly ranges: LabReferenceRangeService,
    private readonly auditService: AuditService
  ) {}

  @Get()
  @ApiQuery({ name: "pendingOnly", required: false })
  @ApiOperation({ summary: "Bandeja de curaduría de rangos de referencia" })
  async list(@Query("pendingOnly") pendingOnly: string | undefined) {
    return this.ranges.list(pendingOnly !== "false");
  }

  @Post(":id/approve")
  @ApiOperation({ summary: "Aprueba un rango de referencia pendiente (M10-RN-009)" })
  async approve(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    const range = await this.ranges.approve(id, req.user.sub);
    const meta = getRequestMeta(req);
    await this.auditService.log({
      actorUserId: req.user.sub,
      actorRole: "CURATOR",
      action: "lab_reference_range.approve",
      resourceType: "lab_reference_range",
      resourceId: id,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    return range;
  }
}
