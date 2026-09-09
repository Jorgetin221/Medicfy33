import { Injectable } from "@nestjs/common";
import { AuditChainVerifierService, type AuditChainVerificationResult } from "../../identity/services/audit-chain-verifier.service";
import { AuditService } from "../../identity/services/audit.service";
import type { RequestMeta } from "../../identity/services/auth.service";

// M15-RN-002: envuelve AuditChainVerifierService para el panel de
// admin — misma forma que AdminMetricsService/AdminUsersService:
// el servicio de dominio (identity) no sabe nada de "quién lo pidió",
// eso vive aquí junto con el registro en audit_log de la propia
// consulta (M13-RN-004).
@Injectable()
export class AdminAuditService {
  constructor(
    private readonly verifierService: AuditChainVerifierService,
    private readonly auditService: AuditService
  ) {}

  async verifyChain(adminUserId: string, meta: RequestMeta): Promise<AuditChainVerificationResult> {
    const result = await this.verifierService.verifyChain();

    // El resultado nunca contiene contenido clínico (R2/M13-CA-001) —
    // solo estado, contador y, si hay ruptura, la secuencia donde
    // ocurrió. Se registra igual que admin.metrics.view.
    await this.auditService.log({
      actorUserId: adminUserId,
      actorRole: "ADMIN",
      action: "admin.audit.chain_verification",
      resourceType: "audit_log_chain",
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { status: result.status, totalChecked: result.totalChecked },
    });

    return result;
  }
}
