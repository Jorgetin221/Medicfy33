import type { Doctor, Specialty } from "@prisma/client";

// M2-RN-003 / M2-CA-001: price never appears in a public response.
// This function is the single place that decides what a public
// (unauthenticated or non-owner) caller may see of a doctor's
// profile — no price field exists in its return type at all, so a
// future caller can't "forget" to strip it.
export interface PublicDoctorView {
  id: string;
  displayName: string | null;
  photoUrl: string | null;
  biography: string | null;
  primarySpecialtyName: string | null;
  secondarySpecialtyIds: string[];
  yearsExperience: number | null;
  languages: string[];
  university: string | null;
  verified: boolean;
  acceptsNewPatients: boolean;
  acceptsTeleconsultation: boolean;
}

export function toPublicDoctorView(
  doctor: Doctor,
  primarySpecialty: Specialty | null
): PublicDoctorView {
  return {
    id: doctor.id,
    displayName: doctor.displayName,
    photoUrl: doctor.photoUrl,
    biography: doctor.biography,
    // M2-RN-002: unclaimed/unverified specialty displays as general
    // medicine, never the raw catalog value.
    primarySpecialtyName: isSpecialtyVerified(doctor) ? primarySpecialty?.nameEs ?? "Medicina General" : "Medicina General",
    secondarySpecialtyIds: doctor.secondarySpecialtyIds,
    yearsExperience: doctor.yearsExperience,
    languages: doctor.languages,
    university: doctor.university,
    // M2-RN-006: the seal requires VERIFIED status; document expiry
    // tracking (cédula de especialidad recert) arrives with the real
    // document-expiry job, not yet built.
    verified: doctor.verificationStatus === "VERIFIED",
    acceptsNewPatients: doctor.acceptsNewPatients,
    acceptsTeleconsultation: doctor.acceptsTeleconsultation,
  };
}

// M2-RN-002: claiming a specialty requires the doctor to be VERIFIED
// and hold a specialty license — there's no separate "specialty
// verified" column in the spec's schema (§6.3), so this is derived.
export function isSpecialtyVerified(doctor: Doctor): boolean {
  return doctor.verificationStatus === "VERIFIED" && doctor.specialtyLicense !== null && doctor.primarySpecialtyId !== null;
}
