import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Doctor, DoctorVerificationStatus } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { AuditService } from "../../identity/services/audit.service";
import type { RequestMeta } from "../../identity/services/auth.service";
import { DOCTOR_SUSPENSION_EFFECTS, type DoctorSuspensionEffects } from "./doctor-suspension-effects.port";

// Minimal admin surface built ahead of M13 (full admin panel), same
// pattern M1 used for DoctorVerifiedGuard ahead of M9 — M2-CA-003/004
// can't be verified without verify/reject/suspend existing somewhere.
@Injectable()
export class DoctorVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(DOCTOR_SUSPENSION_EFFECTS) private readonly suspensionEffects: DoctorSuspensionEffects
  ) {}

  async listQueue(status?: DoctorVerificationStatus): Promise<Doctor[]> {
    return this.prisma.doctor.findMany({
      where: status ? { verificationStatus: status } : {},
      orderBy: { createdAt: "asc" },
      include: { documents: true },
    });
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
  async verify(doctorId: string, adminUserId: string, meta: RequestMeta, specialtyConfirmed?: boolean): Promise<Doctor> {
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
      data: { verificationStatus: status, verifiedByUserId: adminUserId, verifiedAt: new Date(), verificationNotes: null },
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
      metadata: { specialtyConfirmed, status },
    });
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
    return doctor;
  }

  // M2-RN-005: status transition + audit here; appointment reschedule,
  // patient notification and refunds go through DoctorSuspensionEffects
  // (M5/M6, not built — see that port for why). Records are never
  // deleted or hidden, matching "Sus expedientes no se borran ni se
  // ocultan a los pacientes."
  async suspend(
    doctorId: string,
    adminUserId: string,
    meta: RequestMeta
  ): Promise<{ doctor: Doctor; notifiedPatients: number; refundsIssued: number }> {
    const doctor = await this.prisma.doctor.update({
      where: { id: doctorId },
      data: { verificationStatus: "SUSPENDED" },
    });
    const effects = await this.suspensionEffects.handleDoctorSuspended(doctor.userId);
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
