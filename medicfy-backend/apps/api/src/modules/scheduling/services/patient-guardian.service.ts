import { Injectable } from "@nestjs/common";
import type { Patient, PatientGuardian, Prisma } from "@prisma/client";
import type { GuardianCreateInput } from "@medicfy/contracts";
import { isMinor } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";

type Db = PrismaService | Prisma.TransactionClient;

// §6.4 "Menor de edad" caso límite: "Al cumplir 18 años, el acceso
// del tutor se revoca automáticamente por trabajo programado". Sin
// BullMQ conectado todavía (docs/CRITERIOS_DIFERIDOS.md, M2-CA-008),
// así que la revocación se aplica en el momento en que se leen los
// tutores de un paciente, no por un cron a medianoche — nunca hay una
// ventana donde un tutor de un paciente que ya cumplió 18 pase la
// verificación, que es la garantía real que pide la spec.
@Injectable()
export class PatientGuardianService {
  constructor(private readonly prisma: PrismaService) {}

  async create(patientId: string, input: GuardianCreateInput, db: Db = this.prisma): Promise<PatientGuardian> {
    return db.patientGuardian.create({
      data: {
        patientId,
        guardianName: input.guardianName,
        guardianRelation: input.guardianRelation,
        guardianCurp: input.guardianCurp ?? null,
        guardianPhoneE164: input.guardianPhoneE164,
        guardianEmail: input.guardianEmail,
        guardianIdDocumentKey: input.guardianIdDocumentKey,
        consentGrantedAt: new Date(),
        isPrimary: true,
      },
    });
  }

  // Devuelve los tutores vigentes de un paciente, revocando primero
  // (con motivo y fecha, auditado) cualquiera que siga sin revocar en
  // un paciente que ya es mayor de edad.
  async listActiveForPatient(patient: Patient): Promise<PatientGuardian[]> {
    if (!isMinor(patient.birthDate)) {
      await this.prisma.patientGuardian.updateMany({
        where: { patientId: patient.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: "Paciente cumplió 18 años." },
      });
    }
    return this.prisma.patientGuardian.findMany({
      where: { patientId: patient.id, revokedAt: null },
      orderBy: { createdAt: "asc" },
    });
  }
}
