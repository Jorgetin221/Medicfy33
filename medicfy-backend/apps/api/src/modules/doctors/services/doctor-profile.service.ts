import { HttpStatus, Injectable } from "@nestjs/common";
import type { Doctor } from "@prisma/client";
import type { DoctorLegalFieldsUpdateInput, DoctorProfileUpdateInput } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { omitUndefined } from "../../../common/omit-undefined";
import { AuditService } from "../../identity/services/audit.service";
import type { RequestMeta } from "../../identity/services/auth.service";

// M2-CA-002 (aclaración post-v2.1, §17): legal fields are correctable
// while verificationStatus is DRAFT, SUBMITTED, or REJECTED — blocked
// for IN_REVIEW, VERIFIED, and SUSPENDED. REJECTED must stay editable:
// a rejected doctor receives an email asking them to correct their
// application, and the most common rejection reason is a misentered
// legal field. Without an edit path, the rejection flow has no exit.
const LEGAL_FIELD_EDITABLE_STATUSES: ReadonlyArray<Doctor["verificationStatus"]> = [
  "DRAFT",
  "SUBMITTED",
  "REJECTED",
];

@Injectable()
export class DoctorProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async getOwnProfile(userId: string): Promise<Doctor> {
    return this.prisma.doctor.findUniqueOrThrow({ where: { userId } });
  }

  // M4: used by SchedulingAuthService to resolve which Doctor a
  // DOCTOR-or-ASSISTANT caller acts for. Unlike getOwnProfile, this
  // must return null instead of throwing — the caller needs to try
  // "is this user a doctor themselves" before falling back to "are
  // they an assistant scoped to one" without a thrown exception in
  // between.
  async findByUserId(userId: string): Promise<Doctor | null> {
    return this.prisma.doctor.findUnique({ where: { userId } });
  }

  // M2-RN-001/AUTH-RN-004 + M2-CA-002: routes a legal-field edit
  // attempt to either the correction path (DRAFT/SUBMITTED/REJECTED)
  // or a 403, audited either way — checked against the raw request
  // body so an attempt is never silently swallowed by schema stripping.
  async updateLegalFields(
    userId: string,
    doctor: Doctor,
    patch: DoctorLegalFieldsUpdateInput,
    meta: RequestMeta
  ): Promise<Doctor> {
    if (!LEGAL_FIELD_EDITABLE_STATUSES.includes(doctor.verificationStatus)) {
      await this.auditService.log({
        actorUserId: userId,
        actorRole: "DOCTOR",
        action: "doctor.profile.immutable_field_change_denied",
        resourceType: "doctor",
        resourceId: doctor.id,
        result: "DENIED",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: { attemptedFields: Object.keys(patch), verificationStatus: doctor.verificationStatus },
      });
      throw new ApiException(
        "DOCTOR_FIELD_IMMUTABLE",
        "Estos campos no se pueden modificar una vez verificada la cuenta. Contacta a soporte.",
        HttpStatus.FORBIDDEN,
        { fields: Object.keys(patch) }
      );
    }

    let primarySpecialtyId: string | undefined;
    if (patch.primarySpecialtyCode) {
      const specialty = await this.prisma.specialty.findUnique({
        where: { code: patch.primarySpecialtyCode },
      });
      if (!specialty || !specialty.isActive) {
        throw new ApiException(
          "SPECIALTY_NOT_FOUND",
          "Especialidad no encontrada en el catálogo.",
          HttpStatus.BAD_REQUEST
        );
      }
      primarySpecialtyId = specialty.id;
    }

    if (patch.professionalLicense && patch.professionalLicense !== doctor.professionalLicense) {
      const duplicate = await this.prisma.doctor.findUnique({
        where: { professionalLicense: patch.professionalLicense },
      });
      if (duplicate) {
        throw new ApiException(
          "CEDULA_ALREADY_REGISTERED",
          "Esta cédula profesional ya está registrada en otra cuenta.",
          HttpStatus.CONFLICT
        );
      }
    }

    // Editing while SUBMITTED or REJECTED reverts to DRAFT — an admin
    // should never review against legal data that changed mid-review
    // or after a rejection. Already-DRAFT stays DRAFT, no transition
    // needed.
    const revertToDraft = doctor.verificationStatus === "SUBMITTED" || doctor.verificationStatus === "REJECTED";

    const updated = await this.prisma.doctor.update({
      where: { userId },
      data: omitUndefined({
        legalFirstName: patch.legalFirstName,
        legalLastName: patch.legalLastName,
        professionalLicense: patch.professionalLicense,
        specialtyLicense: patch.specialtyLicense,
        primarySpecialtyId,
        verificationStatus: revertToDraft ? ("DRAFT" as const) : undefined,
      }),
    });

    await this.auditService.log({
      actorUserId: userId,
      actorRole: "DOCTOR",
      action: revertToDraft ? "doctor.profile.legal_field_corrected_reverted_to_draft" : "doctor.profile.legal_field_corrected",
      resourceType: "doctor",
      resourceId: doctor.id,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { changedFields: Object.keys(patch), previousStatus: doctor.verificationStatus },
    });

    return updated;
  }

  async updateProfile(userId: string, patch: DoctorProfileUpdateInput): Promise<Doctor> {
    let secondarySpecialtyIds: string[] | undefined;
    if (patch.secondarySpecialtyCodes) {
      const specialties = await this.prisma.specialty.findMany({
        where: { code: { in: patch.secondarySpecialtyCodes }, isActive: true },
      });
      if (specialties.length !== patch.secondarySpecialtyCodes.length) {
        throw new ApiException(
          "SPECIALTY_NOT_FOUND",
          "Una o más especialidades secundarias no existen en el catálogo.",
          HttpStatus.BAD_REQUEST
        );
      }
      secondarySpecialtyIds = specialties.map((s) => s.id);
    }

    return this.prisma.doctor.update({
      where: { userId },
      data: omitUndefined({
        displayName: patch.displayName,
        photoUrl: patch.photoUrl,
        biography: patch.biography,
        secondarySpecialtyIds,
        yearsExperience: patch.yearsExperience,
        languages: patch.languages,
        university: patch.university,
        acceptsNewPatients: patch.acceptsNewPatients,
        acceptsTeleconsultation: patch.acceptsTeleconsultation,
        // M4-RN-005
        minBookingNoticeMinutes: patch.minBookingNoticeMinutes,
        maxBookingWindowDays: patch.maxBookingWindowDays,
        // Parte B §5.1
        professionalPhone: patch.professionalPhone,
        professionalEmail: patch.professionalEmail,
        letterheadPhrase: patch.letterheadPhrase,
      }),
    });
  }
}
