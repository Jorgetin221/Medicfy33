import { Controller, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import { CareRelationshipGuard, type ClinicalRequest } from "../../common/guards/care-relationship.guard";
import { AuditService } from "../identity/services/audit.service";
import { getRequestMeta } from "../identity/request-meta";
import { AtlasSessionService } from "./services/atlas-session.service";

// Atlas Anatómico 3D (INTEGRATION_GUIDE §2/§7.1). CareRelationshipGuard
// es el "paso 0" de la guía: el atlas confía en que solo pedimos
// sesiones para pacientes que el médico puede ver, así que ninguna
// llamada al atlas ocurre sin vínculo activo (R4). El guard ya audita
// los DENIED; aquí se audita el resultado de cada acceso (R3).
@ApiTags("atlas")
@ApiBearerAuth()
@Controller("records/patients/:patientId/atlas-sessions")
@UseGuards(JwtAuthGuard, CareRelationshipGuard)
export class AtlasController {
  constructor(
    private readonly sessions: AtlasSessionService,
    private readonly auditService: AuditService
  ) {}

  @Post()
  @ApiOperation({ summary: "Abre una sesión del visor del atlas anatómico 3D para este paciente" })
  async open(@Param("patientId") patientId: string, @Req() req: ClinicalRequest) {
    const outcome = await this.sessions.openSession(patientId, req.actingDoctorId as string);
    await this.audit(req, `atlas.viewer_session.create.${outcome.kind}`, outcome.kind === "ok" ? outcome.session.id : undefined);
    return outcome;
  }

  @Post(":sessionId/revoke")
  @HttpCode(200)
  @ApiOperation({ summary: "Revoca la sesión del visor al cerrar la ventana" })
  async revoke(@Param("patientId") patientId: string, @Param("sessionId") sessionId: string, @Req() req: ClinicalRequest) {
    await this.sessions.revokeSession(sessionId, patientId, req.actingDoctorId as string);
    await this.audit(req, "atlas.viewer_session.revoke", sessionId);
    return { revoked: true };
  }

  private async audit(req: ClinicalRequest, action: string, sessionId?: string) {
    const meta = getRequestMeta(req);
    await this.auditService.log({
      actorUserId: req.user.sub,
      actorRole: "DOCTOR",
      action,
      resourceType: "patient",
      resourceId: req.clinicalPatientId as string,
      patientId: req.clinicalPatientId as string,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      ...(sessionId ? { metadata: { atlasSessionId: sessionId } } : {}),
    });
  }
}
