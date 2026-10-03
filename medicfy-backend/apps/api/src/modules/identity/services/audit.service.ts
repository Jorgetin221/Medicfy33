import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { AuditLog, AuditResult, Prisma } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { buildAuditLogChainHashInput, sha256Hex } from "../../../common/content-hash.util";

// M15-RN-002 agregó `sequence BigInt?` a audit_log. Express serializa
// las respuestas con JSON.stringify, que lanza TypeError ante un BigInt
// ("Do not know how to serialize a BigInt") y convierte la respuesta en
// un 500. Las filas se exponen tal cual en los endpoints de bitácora,
// así que `sequence` se proyecta a string —la representación JSON
// habitual de un entero de 64 bits— en vez de omitirse, para no perder
// el dato que ancla cada fila a la cadena de integridad.
export type SerializableAuditLog = Omit<AuditLog, "sequence"> & { sequence: string | null };

function toSerializableAuditLog(row: AuditLog): SerializableAuditLog {
  return { ...row, sequence: row.sequence === null ? null : row.sequence.toString() };
}

export interface AuditEntry {
  actorUserId?: string;
  actorRole?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  // M8 (§7.15/R3): paciente referenciado por el evento, cuando aplica
  // — columna dedicada en audit_log (ver schema.prisma), no metadata.
  patientId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  justification?: string;
  result: AuditResult;
  metadata?: Record<string, unknown>;
}

// M15-RN-001/003: every security-relevant event is logged before the
// response is sent, success or denied, no exceptions. R2: never log
// clinical content here — this table only ever carries account/access
// metadata in M1's usage.
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  // M15-RN-002: cada fila se encadena con la anterior mediante un
  // hash SHA-256 (mismo principio que el sello de las notas firmadas
  // — ver content-hash.util.ts). A diferencia de una nota firmada
  // (un médico, un encuentro, sin concurrencia real), audit_log se
  // escribe desde CUALQUIER request concurrente — leer "la última
  // fila" e insertar sin más bifurcaría la cadena bajo carga real, de
  // forma indistinguible de una alteración para el verificador. Por
  // eso todo esto vive dentro de una transacción que bloquea
  // audit_log_chain_state (fila única, id=1) con SELECT ... FOR
  // UPDATE antes de calcular el hash: ninguna otra llamada a log()
  // puede leer el mismo "último hash" hasta que esta transacción
  // confirme. NO simplificar quitando el lock — eso es exactamente lo
  // que permitiría la bifurcación que este diseño evita.
  async log(entry: AuditEntry): Promise<void> {
    const id = randomUUID();
    const occurredAt = new Date();
    const data = {
      actorUserId: entry.actorUserId ?? null,
      actorRole: entry.actorRole ?? null,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId ?? null,
      patientId: entry.patientId ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      requestId: entry.requestId ?? null,
      justification: entry.justification ?? null,
      result: entry.result,
      metadata: entry.metadata !== undefined ? (entry.metadata as Prisma.InputJsonValue) : null,
    };

    await this.prisma.$transaction(async (tx) => {
      const stateRows = await tx.$queryRaw<{ lastSequence: bigint; lastHashSha256: string | null }[]>`
        SELECT "lastSequence", "lastHashSha256" FROM "audit_log_chain_state" WHERE "id" = 1 FOR UPDATE
      `;
      const state = stateRows[0];
      if (!state) {
        throw new Error("unreachable: audit_log_chain_state siempre tiene la fila id=1 (creada por la migración M15-RN-002)");
      }
      const sequence = state.lastSequence + 1n;
      const previousHashSha256 = state.lastHashSha256;

      const hashSha256 = sha256Hex(
        buildAuditLogChainHashInput({
          id,
          actorUserId: data.actorUserId,
          actorRole: data.actorRole,
          action: data.action,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          patientId: data.patientId,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          requestId: data.requestId,
          justification: data.justification,
          result: data.result,
          metadata: data.metadata,
          occurredAtIso: occurredAt.toISOString(),
          sequence: sequence.toString(),
          previousHashSha256,
        })
      );

      await tx.auditLog.create({
        data: { id, ...data, occurredAt, sequence, hashSha256, previousHashSha256 },
      });

      await tx.$executeRaw`
        UPDATE "audit_log_chain_state" SET "lastSequence" = ${sequence}, "lastHashSha256" = ${hashSha256} WHERE "id" = 1
      `;
    });
  }

  // Fase 6 · Prompt 45: "bitácora de acceso consultable: quién leyó
  // qué expediente, cuándo y desde dónde. Incluye las lecturas del
  // propio médico tratante." — audit_log ya se llena en cada lectura
  // clínica de toda la app (R3); esto es lo que faltaba: leerlo.
  async listForPatient(patientId: string, limit = 200): Promise<SerializableAuditLog[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: { patientId },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
    return rows.map(toSerializableAuditLog);
  }

  // "Panel de auditoría para el médico titular: quién ha visto a sus
  // pacientes" — agrega sobre TODOS los pacientes con care_relationship
  // activo con este médico, sin acotar a un paciente de la ruta (a
  // diferencia de listForPatient).
  async listForDoctorPatients(doctorId: string, limit = 200): Promise<SerializableAuditLog[]> {
    const relationships = await this.prisma.careRelationship.findMany({
      where: { doctorId, status: "ACTIVE" },
      select: { patientId: true },
    });
    const patientIds = relationships.map((r) => r.patientId);
    if (patientIds.length === 0) return [];
    const rows = await this.prisma.auditLog.findMany({
      where: { patientId: { in: patientIds } },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
    return rows.map(toSerializableAuditLog);
  }
}
