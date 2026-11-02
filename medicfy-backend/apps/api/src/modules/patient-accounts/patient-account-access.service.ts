import { HttpStatus, Injectable } from "@nestjs/common";
import type { Doctor, Patient } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ApiException } from "../../common/api-exception";
import { AuditService } from "../identity/services/audit.service";
import { SchedulingAuthService } from "../scheduling/services/scheduling-auth.service";

export interface PatientAccountActor {
  userId: string;
  doctor: Doctor;
}

// Autorización compartida por las rutas del médico de este módulo
// (enlace de activación y solicitudes de vinculación). Mismo filtro que
// PatientService.findByIdForDoctor: vínculo ACTIVE y no vencido, y 404
// (nunca 403) para no confirmar que el id existe. Toda denegación queda
// en audit_log (R3).
@Injectable()
export class PatientAccountAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulingAuth: SchedulingAuthService,
    private readonly auditService: AuditService
  ) {}

  // Generar el enlace es operación de recepción también: médico o su
  // asistente (SchedulingAuthService), igual que dar de alta pacientes.
  async resolveDoctorOrAssistant(userId: string): Promise<PatientAccountActor> {
    return { userId, doctor: await this.schedulingAuth.resolveActingDoctor(userId) };
  }

  // Confirmar la identidad de alguien que se registró solo es decisión
  // del médico tratante, no de su asistente.
  async resolveDoctorOnly(userId: string): Promise<PatientAccountActor> {
    const doctor = await this.schedulingAuth.resolveActingDoctor(userId);
    if (doctor.userId !== userId) {
      throw new ApiException(
        "PATIENT_LINK_DOCTOR_ONLY",
        "Solo el médico tratante puede confirmar la identidad de un paciente.",
        HttpStatus.FORBIDDEN
      );
    }
    return { userId, doctor };
  }

  async findPatientForActor(patientId: string, actor: PatientAccountActor, action: string): Promise<Patient> {
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: patientId,
        careRelationships: { some: { doctorId: actor.doctor.id, status: "ACTIVE", expiresAt: { gt: new Date() } } },
      },
    });
    if (!patient) {
      await this.auditService.log({
        actorUserId: actor.userId,
        action,
        resourceType: "patient",
        resourceId: patientId,
        patientId,
        result: "DENIED",
        metadata: { reason: "sin_vinculo_activo_o_inexistente" },
      });
      throw new ApiException("PATIENT_NOT_FOUND", "Paciente no encontrado.", HttpStatus.NOT_FOUND);
    }
    return patient;
  }
}
