import { Injectable } from "@nestjs/common";
import { buildAuditLogChainHashInput, sha256Hex } from "../../../common/content-hash.util";
import { PrismaService } from "../../../prisma/prisma.service";

export interface AuditChainVerificationResult {
  status: "OK" | "ROTA";
  // BigInt no serializa a JSON de forma nativa — se expone como string,
  // mismo criterio que folio.util.ts al convertir un nextval() de
  // Postgres para el cliente.
  totalChecked: number;
  brokenAtSequence: string | null;
  reasons: string[];
}

// M15-RN-002: verificador de integridad de la cadena de audit_log —
// mismo principio de doble comparación que
// NoteIntegrityService.verifyPatientChain (records/services/note-integrity.service.ts):
//
// (a) el hash recalculado de la fila contra su propio hashSha256
//     guardado — detecta que ESA fila fue alterada.
// (b) el previousHashSha256 de la fila contra el hashSha256 (ORIGINAL,
//     guardado) de la fila anterior en la cadena — detecta que una
//     fila VIEJA fue alterada aunque alguien le recalculara su propio
//     hash para que (a) coincida consigo misma; el eslabón con la
//     fila siguiente, que nadie pudo recalcular al mismo tiempo, se
//     rompe igual.
//
// PENDIENTE(jorge): esto es el verificador en sí. La especificación
// pide un "verificador diario que alerta ante ruptura" — la ejecución
// programada (¿cron?, ¿@nestjs/schedule?) y el canal de alerta
// (¿correo al admin?, ¿solo queda en el log de la aplicación?, ¿ambos?)
// no están definidos y no se inventan aquí. Por ahora se expone bajo
// demanda vía GET /admin/audit/chain-verification (solo ADMIN/
// SUPERADMIN) — ver admin-audit.controller.ts.
@Injectable()
export class AuditChainVerifierService {
  constructor(private readonly prisma: PrismaService) {}

  async verifyChain(): Promise<AuditChainVerificationResult> {
    const rows = await this.prisma.auditLog.findMany({
      where: { sequence: { not: null } },
      orderBy: { sequence: "asc" },
    });

    let previousHash: string | null = null;
    let checked = 0;

    for (const row of rows) {
      if (row.sequence === null || row.hashSha256 === null) {
        // Inalcanzable dado el where de arriba — guarda de tipos.
        continue;
      }
      checked++;

      if (row.previousHashSha256 !== previousHash) {
        return {
          status: "ROTA",
          totalChecked: checked,
          brokenAtSequence: row.sequence.toString(),
          reasons: ["El eslabón con la fila anterior de la cadena está roto."],
        };
      }

      const recomputed = sha256Hex(
        buildAuditLogChainHashInput({
          id: row.id,
          actorUserId: row.actorUserId,
          actorRole: row.actorRole,
          action: row.action,
          resourceType: row.resourceType,
          resourceId: row.resourceId,
          patientId: row.patientId,
          ipAddress: row.ipAddress,
          userAgent: row.userAgent,
          requestId: row.requestId,
          justification: row.justification,
          result: row.result,
          metadata: row.metadata,
          occurredAtIso: row.occurredAt.toISOString(),
          sequence: row.sequence.toString(),
          previousHashSha256: row.previousHashSha256,
        })
      );

      if (recomputed !== row.hashSha256) {
        return {
          status: "ROTA",
          totalChecked: checked,
          brokenAtSequence: row.sequence.toString(),
          reasons: ["El contenido guardado no coincide con su propio sello — la fila fue alterada."],
        };
      }

      previousHash = row.hashSha256;
    }

    return { status: "OK", totalChecked: checked, brokenAtSequence: null, reasons: [] };
  }
}
