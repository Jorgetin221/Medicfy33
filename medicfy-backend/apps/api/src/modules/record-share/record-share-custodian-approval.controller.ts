import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { custodianShareDecisionSchema, type CustodianShareDecisionInput } from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { getRequestMeta } from "../identity/request-meta";
import { RecordShareCustodianApprovalService } from "./services/record-share-custodian-approval.service";

// Bandeja del médico tratante (campana en el menú): solicitudes de otros
// médicos para ver el expediente de sus pacientes. Doble autorización
// con el paciente.
@ApiTags("record-share")
@ApiBearerAuth()
@Controller("record-share/custodian")
@UseGuards(JwtAuthGuard)
export class RecordShareCustodianApprovalController {
  constructor(private readonly approvals: RecordShareCustodianApprovalService) {}

  @Get("requests")
  @ApiOperation({ summary: "Solicitudes pendientes de la aprobación del médico tratante" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: "RECORD_SHARE_CUSTODIAN_ONLY" })
  async listPending(@Req() req: Request) {
    return this.approvals.listPending((req as AuthenticatedRequest).user.sub, getRequestMeta(req));
  }

  @Post("requests/:requestId/decide")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Aprobar o rechazar como médico tratante; el acceso se crea cuando también aprueba el paciente" })
  @ApiResponse({ status: 200, description: "{ status: APPROVED | PENDING_PATIENT | DENIED }" })
  @ApiResponse({ status: 403, description: "RECORD_SHARE_CUSTODIAN_ONLY" })
  @ApiResponse({ status: 404, description: "RECORD_SHARE_REQUEST_NOT_FOUND" })
  async decide(
    @Param("requestId") requestId: string,
    @Body(new ZodValidationPipe(custodianShareDecisionSchema)) body: CustodianShareDecisionInput,
    @Req() req: Request
  ) {
    return this.approvals.decide((req as AuthenticatedRequest).user.sub, requestId, body, getRequestMeta(req));
  }
}
