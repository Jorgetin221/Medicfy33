import { Controller, Get, Param, Post, Body, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { assistantPassRequestSchema, type AssistantPassRequestInput } from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { CareRelationshipGuard, type ClinicalRequest } from "../../common/guards/care-relationship.guard";
import { AuditService } from "../identity/services/audit.service";
import { getRequestMeta } from "../identity/request-meta";
import { AssistantPassOrchestratorService } from "./services/assistant-pass-orchestrator.service";

// Fase 8 · Prompt 51. Mismo patrón de guardas/auditoría que
// EncountersController: CareRelationshipGuard resuelve el paciente
// desde :encounterId, y cada acceso a datos clínicos (el contexto que
// se le manda al modelo) queda en audit_log (R3) — esta es la
// auditoría de éxito que el Prompt 50 dejó pendiente para "el
// controller que lo exponga".
@ApiTags("assistant")
@ApiBearerAuth()
@Controller("records/encounters/:encounterId/assistant")
@UseGuards(JwtAuthGuard, CareRelationshipGuard)
export class AssistantController {
  constructor(
    private readonly orchestrator: AssistantPassOrchestratorService,
    private readonly auditService: AuditService
  ) {}

  @Post("passes")
  @ApiOperation({ summary: "Dispara un pase de 'El Segundo Lector' (Prompt 51)" })
  async requestPass(
    @Param("encounterId") encounterId: string,
    @Body(new ZodValidationPipe(assistantPassRequestSchema)) body: AssistantPassRequestInput,
    @Req() req: ClinicalRequest
  ) {
    // El pase se cancela cuando el CLIENTE aborta esta petición (por
    // ejemplo, disparó un pase nuevo antes de que este terminara) —
    // 'close' es el evento estándar de Node cuando la conexión
    // termina, la haya cerrado el cliente o el servidor.
    const controller = new AbortController();
    req.on("close", () => controller.abort());

    const outcome = await this.orchestrator.requestPass(encounterId, body.pase, controller.signal);
    // result siempre SUCCESS aquí: CareRelationshipGuard ya resolvió
    // DENIED antes de llegar a este controller (R3 exige registrar
    // ambos casos, pero no en el mismo lugar). outcome.kind (ok/
    // unavailable/cancelled) va en action, para observabilidad — no
    // es una cuestión de autorización.
    await this.audit(req, `assistant.pass.request.${outcome.kind}`, encounterId);
    return outcome;
  }

  @Get("passes")
  @ApiOperation({ summary: "Lecturas conservadas de este encuentro, más reciente primero" })
  async listReadings(@Param("encounterId") encounterId: string, @Req() req: ClinicalRequest) {
    await this.audit(req, "assistant.pass.list", encounterId);
    return this.orchestrator.listReadings(encounterId);
  }

  // "Resumen objetivo" — a petición explícita del usuario (2026-09-02):
  // rápido, siempre disponible, en cualquier momento de la consulta.
  // Sin persistencia (ver requestSummary), por eso no hay GET aquí.
  @Post("summary")
  @ApiOperation({ summary: "Resumen objetivo, rápido, de lo capturado hasta ahora" })
  async requestSummary(@Param("encounterId") encounterId: string, @Req() req: ClinicalRequest) {
    const controller = new AbortController();
    req.on("close", () => controller.abort());

    const outcome = await this.orchestrator.requestSummary(encounterId, controller.signal);
    await this.audit(req, `assistant.summary.request.${outcome.kind}`, encounterId);
    return outcome;
  }

  private async audit(req: ClinicalRequest, action: string, encounterId: string) {
    const meta = getRequestMeta(req);
    await this.auditService.log({
      actorUserId: req.user.sub,
      actorRole: "DOCTOR",
      action,
      resourceType: "clinical_encounter",
      resourceId: encounterId,
      patientId: req.clinicalPatientId as string,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}
