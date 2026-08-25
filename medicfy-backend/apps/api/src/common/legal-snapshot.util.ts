import type { Doctor, Patient, PracticeLocation, Specialty } from "@prisma/client";
import { omitUndefined } from "./omit-undefined";

function ageInYears(birthDate: Date): number {
  const now = new Date();
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const hasHadBirthdayThisYear =
    now.getUTCMonth() > birthDate.getUTCMonth() ||
    (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() >= birthDate.getUTCDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

function formatAddress(
  location: {
    addressStreet: string | null;
    addressExt: string | null;
    addressColonia: string | null;
    addressMunicipality: string | null;
    addressState: string | null;
  } | null
): string {
  if (!location) return "Domicilio profesional no registrado.";
  return [location.addressStreet, location.addressExt, location.addressColonia, location.addressMunicipality, location.addressState]
    .filter(Boolean)
    .join(", ");
}

// R6/M9-RN-004: snapshot inmutable de los datos legales al momento de
// emitir un documento (receta, orden de laboratorio) — nunca
// resuelto por join después. Extraído de PrescriptionService: tanto
// recetas como órdenes de laboratorio necesitan exactamente los
// mismos campos (médico + paciente), y son campos legales — una sola
// fuente evita que las dos copias se desalineen.
export function buildLegalSnapshot(
  doctor: Doctor & { primarySpecialty: Specialty | null; locations: PracticeLocation[] },
  patient: Patient
) {
  const location = doctor.locations[0] ?? null;
  return {
    doctorNameSnapshot: doctor.displayName ?? `${doctor.legalFirstName} ${doctor.legalLastName}`,
    doctorLicenseSnapshot: doctor.professionalLicense,
    practiceAddressSnapshot: formatAddress(location),
    patientNameSnapshot: `${patient.firstName} ${patient.lastNamePaternal} ${patient.lastNameMaternal ?? ""}`.trim(),
    patientAgeSnapshot: ageInYears(patient.birthDate),
    patientSexSnapshot: patient.sexAtBirth,
    ...omitUndefined({
      doctorSpecialtySnapshot: doctor.primarySpecialty?.nameEs,
      doctorInstitutionSnapshot: doctor.university ?? undefined,
    }),
  };
}
