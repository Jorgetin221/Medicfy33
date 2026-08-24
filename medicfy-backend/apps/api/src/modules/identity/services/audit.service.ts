import { Injectable } from "@nestjs/common";
import type { AuditResult, Prisma } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";

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

  async log(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
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
        ...(entry.metadata !== undefined ? { metadata: entry.metadata as Prisma.InputJsonValue } : {}),
      },
    });
  }
}
