import type { Doctor, DoctorService, PracticeLocation, Specialty } from "@prisma/client";

// M2-RN-003 / M2-CA-001: mismo criterio que PublicDoctorView — nunca
// un campo de precio, ni siquiera nombrado y vacío. La página pública
// solo necesita esto para armar el selector de servicio antes de
// pedir espacios disponibles (GET /doctors/:id/availability, que ya
// exige service_id y ya es público).
export interface PublicServiceView {
  id: string;
  name: string;
  serviceType: string;
  durationMinutes: number;
  locationId: string | null;
}

export function toPublicServiceView(service: DoctorService): PublicServiceView {
  return {
    id: service.id,
    name: service.name,
    serviceType: service.serviceType,
    durationMinutes: service.durationMinutes,
    locationId: service.locationId,
  };
}

// M5-RN-007: solo consultorios activos — un consultorio dado de baja
// no debe aparecer en el enlace público aunque siga en la base de
// datos (historial de citas ya emitidas lo sigue referenciando).
export interface PublicPracticeLocationView {
  id: string;
  name: string;
  addressStreet: string | null;
  addressExt: string | null;
  addressInt: string | null;
  addressColonia: string | null;
  addressMunicipality: string | null;
  addressState: string | null;
  addressPostalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  isPrimary: boolean;
}

export interface PublicDoctorView {
  id: string;
  slug: string;
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
  // M2-RN-004/M2-CA-006: si no hay al menos una ubicación activa o
  // teleconsulta, el médico "no aparece como disponible y no puede
  // recibir citas" — el frontend usa esto para reemplazar la sección
  // de agendar por un estado explícito, nunca un botón que no hace
  // nada (CLAUDE.md §25).
  isBookable: boolean;
  practiceLocations: PublicPracticeLocationView[];
}

export function toPublicDoctorView(
  doctor: Doctor,
  primarySpecialty: Specialty | null,
  activeLocations: PracticeLocation[] = []
): PublicDoctorView {
  return {
    id: doctor.id,
    slug: doctor.slug,
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
    // M2-RN-006: el sello exige VERIFIED, y ahora también que la
    // cédula de especialidad (si tiene fecha de vencimiento
    // registrada) no haya vencido — se degrada al leer, sin job. El
    // recordatorio proactivo a 60 días sigue pendiente (requiere cola
    // real, no construida).
    verified: doctor.verificationStatus === "VERIFIED" && !isSpecialtyLicenseExpired(doctor),
    acceptsNewPatients: doctor.acceptsNewPatients,
    acceptsTeleconsultation: doctor.acceptsTeleconsultation,
    isBookable: doctor.acceptsTeleconsultation || activeLocations.length > 0,
    practiceLocations: activeLocations.map((loc) => ({
      id: loc.id,
      name: loc.name,
      addressStreet: loc.addressStreet,
      addressExt: loc.addressExt,
      addressInt: loc.addressInt,
      addressColonia: loc.addressColonia,
      addressMunicipality: loc.addressMunicipality,
      addressState: loc.addressState,
      addressPostalCode: loc.addressPostalCode,
      latitude: loc.latitude,
      longitude: loc.longitude,
      phone: loc.phone,
      isPrimary: loc.isPrimary,
    })),
  };
}

// M2-RN-002: claiming a specialty requires the doctor to be VERIFIED
// and hold a specialty license — there's no separate "specialty
// verified" column in the spec's schema (§6.3), so this is derived.
export function isSpecialtyVerified(doctor: Doctor): boolean {
  return doctor.verificationStatus === "VERIFIED" && doctor.specialtyLicense !== null && doctor.primarySpecialtyId !== null;
}

export function isSpecialtyLicenseExpired(doctor: Doctor): boolean {
  return doctor.specialtyLicenseExpiresAt !== null && doctor.specialtyLicenseExpiresAt.getTime() < Date.now();
}
