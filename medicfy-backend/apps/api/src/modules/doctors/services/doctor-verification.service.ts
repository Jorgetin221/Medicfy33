import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Doctor, DoctorVerificationStatus } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { omitUndefined } from "../../../common/omit-undefined";
import { businessHoursSince } from "../../../common/business-hours.util";
import { AuditService } from "../../identity/services/audit.service";
import type { RequestMeta } from "../../identity/services/auth.service";
import { DOCTOR_SUSPENSION_EFFECTS, type DoctorSuspensionEffects } from "./doctor-suspension-effects.port";
import { NotificationsService } from "../../notifications/services/notifications.service";
import { NotificationLinkService } from "../../notifications/services/notification-link.service";
import {
  renderDoctorVerificationApproved,
  renderDoctorVerificationRejected,
} from "../../notifications/services/notification-templates";

function mustGetAppBaseUrl(): string {
  const url = process.env.APP_BASE_URL;
  if (!url) {
    throw new Error("APP_BASE_URL is not set");
  }
  return url;
}

export type DoctorQueueItem = Doctor & { businessHoursWaiting: number };

// Minimal admin surface built ahead of M13 (full admin panel), same
// pattern M1 used for DoctorVerifiedGuard ahead of M9 — M2-CA-003/004
// can't be verified without verify/reject/suspend existing somewhere.
@Injectable()
export class DoctorVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(DOCTOR_SUSPENSION_EFFECTS) private readonly suspensionEffects: DoctorSuspensionEffects,
    // M12 prueba-de-concepto: primer disparador real conectado al
    // pipeline de notificaciones (elegido por ser el flujo mejor
    // entendido y de menor riesgo del backend — ver reporte). Los
    // demás disparadores (citas, recetas, laboratorio) quedan
    // pendientes de conectar, documentado como tal.
    private readonly notificationsService: NotificationsService,
    private readonly notificationLinkService: NotificationLinkService
  ) {}

  async listQueue(status?: DoctorVerificationStatus): Promise<DoctorQueueItem[]> {
    const doctors = await this.prisma.doctor.findMany({
      where: status ? { verificationStatus: status } : {},
      orderBy: { createdAt: "asc" },
      include: { documents: true },
    });
    const now = new Date();
    return doctors.map((doctor) => ({
      ...doctor,
      businessHoursWaiting: businessHoursSince(doctor.createdAt, now),
    }));
  }

  async getDetail(doctorId: string): Promise<Doctor & { documents: unknown[] }> {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      include: { documents: true },
    });
    if (!doctor) {
      throw new ApiException("DOCTOR_NOT_FOUND", "Médico no encontrado.", HttpStatus.NOT_FOUND);
    }
    return doctor;
  }

  // Parte B §5.2 [AGREGAR]: specialtyConfirmed=false sobre un médico
  // con especialidad que requiere cédula de especialidad aterriza en
  // VERIFIED_SPECIALTY_UNCONFIRMED en vez de VERIFIED — la cédula
  // profesional ya se verificó, el certificado de especialidad no.
  // Omitir el parámetro conserva el comportamiento previo (VERIFIED).
  async verify(
    doctorId: string,
    adminUserId: string,
    meta: RequestMeta,
    specialtyConfirmed?: boolean,
    specialtyLicenseExpiresAt?: string
  ): Promise<Doctor> {
    const existing = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      include: { primarySpecialty: true },
    });
    if (!existing) {
      throw new ApiException("DOCTOR_NOT_FOUND", "Médico no encontrado.", HttpStatus.NOT_FOUND);
    }
    const status =
      specialtyConfirmed === false && existing.primarySpecialty?.requiresSpecialtyLicense
        ? "VERIFIED_SPECIALTY_UNCONFIRMED"
        : "VERIFIED";

    const doctor = await this.prisma.doctor.update({
      where: { id: doctorId },
      data: omitUndefined({
        verificationStatus: status,
        verifiedByUserId: adminUserId,
        verifiedAt: new Date(),
        verificationNotes: null,
        // M2-RN-006: el admin confirma/corrige la fecha leída del
        // documento; el valor que el médico capturó antes de revisar
        // era solo un borrador.
        specialtyLicenseExpiresAt: specialtyLicenseExpiresAt
          ? new Date(`${specialtyLicenseExpiresAt}T00:00:00Z`)
          : undefined,
      }),
    });
    await this.auditService.log({
      actorUserId: adminUserId,
      actorRole: "ADMIN",
      action: "doctor.verify",
      resourceType: "doctor",
      resourceId: doctorId,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { specialtyConfirmed, status, specialtyLicenseExpiresAt },
    });
    await this.notifyVerificationDecision(doctor, "approved");
    return doctor;
  }

  async reject(doctorId: string, reason: string, adminUserId: string, meta: RequestMeta): Promise<Doctor> {
    const doctor = await this.prisma.doctor.update({
      where: { id: doctorId },
      data: { verificationStatus: "REJECTED", verificationNotes: reason },
    });
    await this.auditService.log({
      actorUserId: adminUserId,
      actorRole: "ADMIN",
      action: "doctor.reject",
      resourceType: "doctor",
      resourceId: doctorId,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { reason },
    });
    await this.notifyVerificationDecision(doctor, "rejected");
    return doctor;
  }

  // M12 (notificaciones): DOCTOR_VERIFICATION_APPROVED/REJECTED. Sin
  // reintentos (decisión explícita del usuario) — si el envío falla,
  // NotificationsService lo deja en FAILED y aquí no se hace nada más;
  // la decisión de verificación en sí ya se guardó y no depende de si
  // la notificación salió.
  private async notifyVerificationDecision(doctor: Doctor, decision: "approved" | "rejected"): Promise<void> {
    const { plainToken } = await this.notificationLinkService.issue(doctor.userId, "doctor_verification", doctor.id);
    const actionLink = this.notificationLinkService.buildUrl(mustGetAppBaseUrl(), plainToken);
    const rendered =
      decision === "approved"
        ? renderDoctorVerificationApproved({ recipientFirstName: doctor.legalFirstName, actionLink })
        : renderDoctorVerificationRejected({ recipientFirstName: doctor.legalFirstName, actionLink });
    await this.notificationsService.send({
      userId: doctor.userId,
      templateCode: decision === "approved" ? "DOCTOR_VERIFICATION_APPROVED" : "DOCTOR_VERIFICATION_REJECTED",
      rendered,
      relatedEntityType: "doctor_verification",
      relatedEntityId: doctor.id,
    });
  }

  // M2-RN-005: status transition + audit here; cancelling future
  // appointments and notifying patients goes through
  // DoctorSuspensionEffects (see that port — refund issuance itself
  // still waits on M6). Records are never deleted or hidden, matching
  // "Sus expedientes no se borran ni se ocultan a los pacientes."
  async suspend(
    doctorId: string,
    adminUserId: string,
    meta: RequestMeta
  ): Promise<{ doctor: Doctor; notifiedPatients: number; refundsIssued: number }> {
    const doctor = await this.prisma.doctor.update({
      where: { id: doctorId },
      data: { verificationStatus: "SUSPENDED" },
    });
    const effects = await this.suspensionEffects.handleDoctorSuspended(doctor.userId, adminUserId);
    await this.auditService.log({
      actorUserId: adminUserId,
      actorRole: "ADMIN",
      action: "doctor.suspend",
      resourceType: "doctor",
      resourceId: doctorId,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: effects,
    });
    return { doctor, ...effects };
  }
}
