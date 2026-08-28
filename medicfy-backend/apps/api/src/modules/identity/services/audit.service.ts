import { Injectable } from "@nestjs/common";
import type { AuditLog, AuditResult, Prisma } from "@prisma/client";
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

  // Fase 6 · Prompt 45: "bitácora de acceso consultable: quién leyó
  // qué expediente, cuándo y desde dónde. Incluye las lecturas del
  // propio médico tratante." — audit_log ya se llena en cada lectura
  // clínica de toda la app (R3); esto es lo que faltaba: leerlo.
  async listForPatient(patientId: string, limit = 200): Promise<AuditLog[]> {
    return this.prisma.auditLog.findMany({
      where: { patientId },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
  }

  // "Panel de auditoría para el médico titular: quién ha visto a sus
  // pacientes" — agrega sobre TODOS los pacientes con care_relationship
  // activo con este médico, sin acotar a un paciente de la ruta (a
  // diferencia de listForPatient).
  async listForDoctorPatients(doctorId: string, limit = 200): Promise<AuditLog[]> {
    const relationships = await this.prisma.careRelationship.findMany({
      where: { doctorId, status: "ACTIVE" },
      select: { patientId: true },
    });
    const patientIds = relationships.map((r) => r.patientId);
    if (patientIds.length === 0) return [];
    return this.prisma.auditLog.findMany({
      where: { patientId: { in: patientIds } },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
  }
}
