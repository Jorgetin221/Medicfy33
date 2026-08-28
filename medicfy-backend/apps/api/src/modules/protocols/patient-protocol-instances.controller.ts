import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  patientProtocolInstanceCloseSchema,
  patientProtocolInstanceStartSchema,
  protocolSessionRecordSchema,
  type PatientProtocolInstanceCloseInput,
  type PatientProtocolInstanceStartInput,
  type ProtocolSessionRecordInput,
} from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { CareRelationshipGuard, type ClinicalRequest } from "../../common/guards/care-relationship.guard";
import { AuditService } from "../identity/services/audit.service";
import { getRequestMeta } from "../identity/request-meta";
import { PatientProtocolInstanceService } from "./services/patient-protocol-instance.service";

// Fase 7 · Prompt 47B/C — instancias de protocolo por paciente y sus
// sesiones. Todo pasa por CareRelationshipGuard, mismo patrón que
// records/labs.
@ApiTags("protocols")
@ApiBearerAuth()
@Controller("records/patients/:patientId/protocol-instances")
@UseGuards(JwtAuthGuard, CareRelationshipGuard)
export class PatientProtocolInstancesController {
  constructor(
    private readonly instances: PatientProtocolInstanceService,
    private readonly auditService: AuditService
  ) {}

  @Get()
  @ApiOperation({ summary: "Prompt 48B: instancias de protocolo del paciente — vista de adherencia" })
  async list(@Param("patientId") patientId: string, @Req() req: ClinicalRequest) {
    await this.audit(req, patientId, "protocols.instances.list");
    return this.instances.listForPatient(patientId);
  }

  @Post()
  @ApiOperation({ summary: "Prompt 47B: inicia una instancia — genera todas las sesiones con su fecha propuesta" })
  async start(
    @Param("patientId") patientId: string,
    @Body(new ZodValidationPipe(patientProtocolInstanceStartSchema)) body: PatientProtocolInstanceStartInput,
    @Req() req: ClinicalRequest
  ) {
    const instance = await this.instances.startInstance(patientId, req.user.sub, body.protocolId);
    await this.audit(req, patientId, "protocols.instances.start", instance.id);
    return instance;
  }

  @Post(":instanceId/close")
  @ApiOperation({ summary: "Prompt 47B: cierra una instancia — motivo obligatorio" })
  async close(
    @Param("patientId") patientId: string,
    @Param("instanceId") instanceId: string,
    @Body(new ZodValidationPipe(patientProtocolInstanceCloseSchema)) body: PatientProtocolInstanceCloseInput,
    @Req() req: ClinicalRequest
  ) {
    const instance = await this.instances.closeInstance(patientId, instanceId, body);
    await this.audit(req, patientId, "protocols.instances.close", instance.id);
    return instance;
  }

  @Post(":instanceId/sessions/:sessionId/record")
  @ApiOperation({ summary: "Prompt 47C: registra una sesión — nunca rechaza fuera de ventana, solo la marca" })
  async recordSession(
    @Param("patientId") patientId: string,
    @Param("instanceId") instanceId: string,
    @Param("sessionId") sessionId: string,
    @Body(new ZodValidationPipe(protocolSessionRecordSchema)) body: ProtocolSessionRecordInput,
    @Req() req: ClinicalRequest
  ) {
    const session = await this.instances.recordSession(patientId, instanceId, sessionId, body);
    await this.audit(req, patientId, "protocols.sessions.record", session.id);
    return session;
  }

  private async audit(req: ClinicalRequest, patientId: string, action: string, resourceId?: string) {
    const meta = getRequestMeta(req);
    await this.auditService.log({
      actorUserId: req.user.sub,
      actorRole: "DOCTOR",
      action,
      resourceType: "protocol_instance",
      ...(resourceId !== undefined ? { resourceId } : {}),
      patientId,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}
