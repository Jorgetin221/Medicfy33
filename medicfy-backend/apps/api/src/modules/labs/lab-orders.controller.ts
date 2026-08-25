import { Body, Controller, Get, Param, Post, Req, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  labOrderCreateSchema,
  labOrderCancelSchema,
  type LabOrderCreateInput,
  type LabOrderCancelInput,
} from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { DoctorVerifiedGuard } from "../identity/guards/doctor-verified.guard";
import { CareRelationshipGuard, type ClinicalRequest } from "../../common/guards/care-relationship.guard";
import { AuditService } from "../identity/services/audit.service";
import { getRequestMeta } from "../identity/request-meta";
import { LabOrderService } from "./services/lab-order.service";

// M10 — ÓRDENES DE LABORATORIO (parcial en MVP). Mismo patrón de
// guard/auditoría que prescriptions.
@ApiTags("labs")
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, CareRelationshipGuard)
export class LabOrdersController {
  constructor(
    private readonly labOrders: LabOrderService,
    private readonly auditService: AuditService
  ) {}

  @Post("lab-orders/encounters/:encounterId")
  @UseGuards(DoctorVerifiedGuard)
  @ApiOperation({ summary: "Emite orden de laboratorio ligada al encuentro; firma con contraseña+TOTP" })
  async create(
    @Param("encounterId") encounterId: string,
    @Body(new ZodValidationPipe(labOrderCreateSchema)) body: LabOrderCreateInput,
    @Req() req: ClinicalRequest
  ) {
    const labOrder = await this.labOrders.create(
      encounterId,
      req.actingDoctorId as string,
      req.user.sub,
      req.clinicalPatientId as string,
      body
    );
    await this.audit(req, "lab_orders.create", labOrder.id);
    return labOrder;
  }

  @Get("lab-orders/:labOrderId/pdf")
  @ApiOperation({ summary: "Descarga el PDF de la orden (ambas rutas de firma)" })
  async pdf(@Param("labOrderId") labOrderId: string, @Req() req: ClinicalRequest): Promise<StreamableFile> {
    const { buffer, contentType } = await this.labOrders.getPdf(labOrderId);
    await this.audit(req, "lab_orders.pdf.download", labOrderId);
    return new StreamableFile(buffer, { type: contentType });
  }

  @Post("lab-orders/:labOrderId/cancel")
  @ApiOperation({ summary: "Cancelar — nunca UPDATE, inserta LabOrderCancellation" })
  async cancel(
    @Param("labOrderId") labOrderId: string,
    @Body(new ZodValidationPipe(labOrderCancelSchema)) body: LabOrderCancelInput,
    @Req() req: ClinicalRequest
  ) {
    const cancellation = await this.labOrders.cancel(labOrderId, req.user.sub, body.reason);
    await this.audit(req, "lab_orders.cancel", labOrderId);
    return cancellation;
  }

  private async audit(req: ClinicalRequest, action: string, resourceId: string) {
    const meta = getRequestMeta(req);
    await this.auditService.log({
      actorUserId: req.user.sub,
      actorRole: "DOCTOR",
      action,
      resourceType: "lab_order",
      resourceId,
      patientId: req.clinicalPatientId as string,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}
