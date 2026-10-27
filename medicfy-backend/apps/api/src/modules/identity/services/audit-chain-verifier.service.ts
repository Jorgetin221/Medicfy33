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
// Auditoría 2026-10-21 (M-16): además de (a) y (b) el verificador ahora
// detecta (c) HUECOS — una fila borrada a la mitad deja un salto en
// `sequence` aunque los hashes vecinos se recalcularan — y (d) un FINAL
// truncado, comparando la última fila contra audit_log_chain_state
// (borrar las últimas filas no rompe ningún eslabón, pero el estado sí
// recuerda hasta dónde llegó la cadena). Lee por lotes en vez de cargar
// la tabla completa en memoria.
const BATCH_SIZE = 1000;

type ChainRow = Awaited<ReturnType<PrismaService["auditLog"]["findMany"]>>[number];

@Injectable()
export class AuditChainVerifierService {
  constructor(private readonly prisma: PrismaService) {}

  async verifyChain(): Promise<AuditChainVerificationResult> {
    // El estado se lee PRIMERO y solo se verifica hasta ahí: filas que
    // entran mientras corre la verificación no cuentan como truncado.
    const state = await this.prisma.auditLogChainState.findUnique({ where: { id: 1 } });
    const upTo = state?.lastSequence ?? null;
    let previousHash: string | null = null;
    let previousSequence: bigint | null = null;
    let checked = 0;
    let cursor: bigint | null = null;

    for (;;) {
      const rows: ChainRow[] = await this.prisma.auditLog.findMany({
        where: {
          sequence: {
            ...(cursor === null ? { not: null } : { gt: cursor }),
            ...(upTo !== null ? { lte: upTo } : {}),
          },
        },
        orderBy: { sequence: "asc" },
        take: BATCH_SIZE,
      });
      if (rows.length === 0) break;

      for (const row of rows) {
        if (row.sequence === null || row.hashSha256 === null) continue;
        checked++;
        const broken = this.checkRow(row, previousHash, previousSequence);
        if (broken) {
          return { status: "ROTA", totalChecked: checked, brokenAtSequence: row.sequence.toString(), reasons: [broken] };
        }
        previousHash = row.hashSha256;
        previousSequence = row.sequence;
      }
      const last = rows[rows.length - 1];
      cursor = last?.sequence ?? null;
      if (rows.length < BATCH_SIZE || cursor === null) break;
    }

    const tail = this.checkTail(state, previousSequence, previousHash);
    if (tail) {
      return { status: "ROTA", totalChecked: checked, brokenAtSequence: previousSequence?.toString() ?? null, reasons: [tail] };
    }
    return { status: "OK", totalChecked: checked, brokenAtSequence: null, reasons: [] };
  }

  private checkRow(row: ChainRow, previousHash: string | null, previousSequence: bigint | null): string | null {
    const sequence = row.sequence as bigint;
    const expected = previousSequence === null ? 1n : previousSequence + 1n;
    if (sequence !== expected) {
      return "Falta al menos una fila de la cadena (hay un hueco en la secuencia).";
    }
    if (row.previousHashSha256 !== previousHash) {
      return "El eslabón con la fila anterior de la cadena está roto.";
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
        sequence: sequence.toString(),
        previousHashSha256: row.previousHashSha256,
      })
    );
    if (recomputed !== row.hashSha256) {
      return "El contenido guardado no coincide con su propio sello — la fila fue alterada.";
    }
    return null;
  }

  private checkTail(
    state: { lastSequence: bigint; lastHashSha256: string | null } | null,
    lastSequence: bigint | null,
    lastHash: string | null
  ): string | null {
    if (!state) return null;
    const expectedSequence = state.lastSequence;
    if ((lastSequence ?? 0n) !== expectedSequence || (lastHash ?? null) !== (state.lastHashSha256 ?? null)) {
      return "La cadena termina antes de lo registrado: se borraron filas del final de la bitácora.";
    }
    return null;
  }
}
