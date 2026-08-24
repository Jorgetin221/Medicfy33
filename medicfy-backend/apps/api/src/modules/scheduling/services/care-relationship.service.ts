import { Injectable } from "@nestjs/common";
import type { CareRelationship, CareRelationshipOrigin, Prisma } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";

const EXPIRY_MONTHS = 18;

function addMonthsUtc(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

type Db = PrismaService | Prisma.TransactionClient;

// AUTH-RN-001: care_relationship activo por una de tres vías
// (appointment, patient_granted, created_by_doctor), caduca a los 18
// meses sin interacción, se renueva con nueva cita o autorización.
// Sin scheduler todavía — expiración revisada en el momento del
// acceso (isActive), mismo patrón que PatientGuardian.
@Injectable()
export class CareRelationshipService {
  constructor(private readonly prisma: PrismaService) {}

  // `db` accepts a transaction client so callers (PatientService,
  // AppointmentStateMachineService) can create/renew the relationship
  // atomically with whatever action triggered it — M2-CA-009 requires
  // the care_relationship to exist "automáticamente", not eventually.
  async createOrRenew(patientId: string, doctorId: string, origin: CareRelationshipOrigin, db: Db = this.prisma): Promise<CareRelationship> {
    const now = new Date();
    const expiresAt = addMonthsUtc(now, EXPIRY_MONTHS);

    const existing = await db.careRelationship.findFirst({
      where: { patientId, doctorId, status: "ACTIVE" },
    });

    if (existing) {
      return db.careRelationship.update({
        where: { id: existing.id },
        data: { lastInteractionAt: now, expiresAt },
      });
    }

    return db.careRelationship.create({
      data: { patientId, doctorId, origin, startedAt: now, lastInteractionAt: now, expiresAt },
    });
  }

  async revoke(careRelationshipId: string, revokedBy: string): Promise<CareRelationship> {
    return this.prisma.careRelationship.update({
      where: { id: careRelationshipId },
      data: { status: "REVOKED", revokedAt: new Date(), revokedBy },
    });
  }

  // AUTH-RN-001's "solo si existe un registro care_relationship
  // activo" — evaluado aquí, no solo status==='ACTIVE' en la fila: un
  // registro con status ACTIVE pero expiresAt ya pasado se trata como
  // inactivo (y se marca EXPIRED en el mismo momento, en vez de
  // esperar a un job que no existe).
  async hasActiveRelationship(patientId: string, doctorId: string): Promise<boolean> {
    const relationship = await this.prisma.careRelationship.findFirst({
      where: { patientId, doctorId, status: "ACTIVE" },
      orderBy: { expiresAt: "desc" },
    });
    if (!relationship) {
      return false;
    }
    if (relationship.expiresAt < new Date()) {
      await this.prisma.careRelationship.update({
        where: { id: relationship.id },
        data: { status: "EXPIRED" },
      });
      return false;
    }
    return true;
  }
}
