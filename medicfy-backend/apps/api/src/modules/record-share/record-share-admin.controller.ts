import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { recordShareSuspendInputSchema, type RecordShareSuspendInput } from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { AdminGuard } from "../identity/guards/admin.guard";
import { getRequestMeta } from "../identity/request-meta";
import { RecordShareOversightService } from "./services/record-share-oversight.service";

// PR-EXP-06: cola de reportes de abuso y suspensión. R4: el admin
// NUNCA ve contenido clínico — solo metadatos del grant.
@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin/record-share")
@UseGuards(JwtAuthGuard, AdminGuard)
export class RecordShareAdminController {
  constructor(private readonly oversight: RecordShareOversightService) {}

  @Get("abuse-reports")
  @ApiOperation({ summary: "Reportes de abuso de acceso compartido — solo metadatos (R4)" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: "Requiere rol de administrador" })
  async listAbuseReports() {
    return this.oversight.listAbuseReports();
  }

  @Post("grants/:grantId/suspend")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Suspende un acceso vigente — motivo obligatorio (15-500), queda en audit_log" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 409, description: "RECORD_SHARE_GRANT_NOT_ACTIVE" })
  async suspend(
    @Param("grantId") grantId: string,
    @Body(new ZodValidationPipe(recordShareSuspendInputSchema)) body: RecordShareSuspendInput,
    @Req() req: Request
  ) {
    const { user } = req as AuthenticatedRequest;
    await this.oversight.suspend(user.sub, user.primaryRole, grantId, body.reason, getRequestMeta(req));
    return { suspended: true };
  }
}
