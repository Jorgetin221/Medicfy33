import { HttpStatus, Injectable } from "@nestjs/common";
import type { Doctor, Prisma } from "@prisma/client";
import type { DoctorLegalFieldsUpdateInput, DoctorProfileUpdateInput, DoctorPublicSearchQuery } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { omitUndefined } from "../../../common/omit-undefined";
import { AuditService } from "../../identity/services/audit.service";
import type { RequestMeta } from "../../identity/services/auth.service";
import { toPublicDoctorView, type PublicDoctorView } from "../doctor-public-view";

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
        specialtyLicenseExpiresAt: patch.specialtyLicenseExpiresAt
          ? new Date(`${patch.specialtyLicenseExpiresAt}T00:00:00Z`)
          : undefined,
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

  // M5-RN-007: "/dr/{slug}" — sin guard, cualquiera puede llamar esto.
  // Resuelve por slug (nunca por id, que no es el identificador público)
  // y arma la vista con toPublicDoctorView, el único lugar que decide
  // qué campos son públicos.
  async getPublicViewBySlug(slug: string): Promise<PublicDoctorView> {
    const doctor = await this.prisma.doctor.findUnique({
      where: { slug },
      include: { primarySpecialty: true },
    });
    if (!doctor) {
      throw new ApiException("DOCTOR_NOT_FOUND", "Médico no encontrado.", HttpStatus.NOT_FOUND);
    }

    const activeLocations = await this.prisma.practiceLocation.findMany({
      where: { doctorId: doctor.id, isActive: true },
    });

    return toPublicDoctorView(doctor, doctor.primarySpecialty, activeLocations);
  }

  // M3 (spec §7, v2.3/v2.4): GET /doctors/public — sin guard. Cursor
  // opaco = offset en base64url (no un id encadenado): a esta escala
  // es correcto y mucho más simple que keyset pagination sobre un
  // campo no-único (displayName), y sigue siendo un cursor real desde
  // el contrato de la API (el cliente nunca ve ni decide el offset).
  async searchPublic(query: DoctorPublicSearchQuery): Promise<{ items: PublicDoctorView[]; nextCursor: string | null }> {
    const limit = query.limit ?? 20;
    let offset = 0;
    if (query.cursor) {
      offset = Number(Buffer.from(query.cursor, "base64url").toString("utf8"));
      if (!Number.isInteger(offset) || offset < 0) {
        throw new ApiException("VALIDATION_ERROR", "cursor inválido.", HttpStatus.BAD_REQUEST);
      }
    }

    // M3-RN-001: mismo umbral que el resto de vistas públicas del médico.
    const where: Prisma.DoctorWhereInput = {
      verificationStatus: { notIn: ["DRAFT", "REJECTED", "SUSPENDED"] },
    };
    // M3-RN-002: displayName o nombre de especialidad — el nombre
    // legal nunca es buscable públicamente (mismo criterio que
    // toPublicDoctorView). Un solo cuadro de búsqueda en el frontend
    // manda todo como "q" (nunca pide al usuario distinguir "busco un
    // nombre" de "busco una especialidad"), así que "q" coincide con
    // cualquiera de los dos campos — sigue siendo coincidencia de
    // texto simple, no un motor difuso ni un mapeo clínico inventado.
    if (query.q) {
      where.OR = [
        { displayName: { contains: query.q, mode: "insensitive" } },
        { primarySpecialty: { nameEs: { contains: query.q, mode: "insensitive" } } },
      ];
    }
    if (query.specialty) where.primarySpecialty = { code: query.specialty };
    if (query.teleconsultation !== undefined) where.acceptsTeleconsultation = query.teleconsultation;
    if (query.acceptsNewPatients !== undefined) where.acceptsNewPatients = query.acceptsNewPatients;
    if (query.language) where.languages = { has: query.language };
    // M3-RN-006: texto simple contra ubicaciones activas — no geolocalización.
    if (query.location) {
      where.locations = {
        some: {
          isActive: true,
          OR: [
            { addressMunicipality: { contains: query.location, mode: "insensitive" } },
            { addressState: { contains: query.location, mode: "insensitive" } },
          ],
        },
      };
    }

    const doctors = await this.prisma.doctor.findMany({
      where,
      include: { primarySpecialty: true },
      orderBy: [{ displayName: { sort: "asc", nulls: "last" } }, { id: "asc" }],
      skip: offset,
      take: limit + 1,
    });

    const hasMore = doctors.length > limit;
    const page = doctors.slice(0, limit);

    const locations = await this.prisma.practiceLocation.findMany({
      where: { doctorId: { in: page.map((d) => d.id) }, isActive: true },
    });
    const locationsByDoctor = new Map<string, typeof locations>();
    for (const loc of locations) {
      locationsByDoctor.set(loc.doctorId, [...(locationsByDoctor.get(loc.doctorId) ?? []), loc]);
    }

    return {
      items: page.map((d) => toPublicDoctorView(d, d.primarySpecialty, locationsByDoctor.get(d.id) ?? [])),
      nextCursor: hasMore ? Buffer.from(String(offset + limit)).toString("base64url") : null,
    };
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
        // DT-05: mismo shape que CancellationPolicy — resolveCancellationPolicy
        // (scheduling/cancellation-policy.ts) rellena lo faltante contra el
        // default del spec al leer, así que aquí se guarda tal cual.
        cancellationPolicy: patch.cancellationPolicy as Prisma.InputJsonValue | undefined,
      }),
    });
  }
}
