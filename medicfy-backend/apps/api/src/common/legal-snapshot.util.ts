import { HttpStatus } from "@nestjs/common";
import type { Doctor, Patient, PracticeLocation, Specialty } from "@prisma/client";
import { ApiException } from "./api-exception";
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

type AddressFields = Pick<PracticeLocation, "addressStreet" | "addressExt" | "addressColonia" | "addressMunicipality" | "addressState">;

function formatAddress(location: AddressFields): string {
  return [location.addressStreet, location.addressExt, location.addressColonia, location.addressMunicipality, location.addressState]
    .filter(Boolean)
    .join(", ");
}

// A-13 / R6: el domicilio profesional es campo obligatorio del art. 33
// del Reglamento de Insumos para la Salud. Antes, sin consultorio, la
// receta se emitía igual con el texto "Domicilio profesional no
// registrado." — ahora no se emite. Calle, municipio y estado son el
// mínimo para que el domicilio identifique un lugar.
// PENDIENTE(jorge): confirmar con el abogado si número exterior y
// colonia también deben ser obligatorios. Ref: R6, art. 33 RIS.
function missingAddressFields(location: AddressFields | null): string[] {
  if (!location) return ["practiceAddress"];
  const required: [keyof AddressFields, string][] = [
    ["addressStreet", "practiceAddress.street"],
    ["addressMunicipality", "practiceAddress.municipality"],
    ["addressState", "practiceAddress.state"],
  ];
  return required.filter(([field]) => !location[field]?.trim()).map(([, name]) => name);
}

// R6/M9-RN-004: snapshot inmutable de los datos legales al momento de
// emitir un documento (receta, orden de laboratorio) — nunca
// resuelto por join después. Extraído de PrescriptionService: tanto
// recetas como órdenes de laboratorio necesitan exactamente los
// mismos campos (médico + paciente), y son campos legales — una sola
// fuente evita que las dos copias se desalineen.
export function buildLegalSnapshot(
  doctor: Doctor & { primarySpecialty: Specialty | null; locations: PracticeLocation[] },
  patient: Patient,
  missingFieldErrorCode = "PRESCRIPTION_MISSING_LEGAL_FIELD"
) {
  const location = doctor.locations[0] ?? null;
  const missing = missingAddressFields(location);
  if (!location || missing.length > 0) {
    throw new ApiException(
      missingFieldErrorCode,
      "Falta el domicilio profesional completo (calle, municipio y estado). Regístralo en tu consultorio principal desde Perfil antes de emitir.",
      HttpStatus.UNPROCESSABLE_ENTITY,
      { missing }
    );
  }
  return {
    // A-13 / R6: el nombre LEGAL del médico (el de la cédula), nunca el
    // nombre comercial (displayName) que usa en su perfil público.
    doctorNameSnapshot: `${doctor.legalFirstName} ${doctor.legalLastName}`,
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
