// Nombre a mostrar de un médico: su displayName público si lo definió,
// o su nombre legal como respaldo — nunca una pantalla vacía (a
// diferencia de toPublicDoctorView, que sí deja pasar displayName
// null porque esa vista es de marketing, no de identificación).
export function doctorDisplayName(doctor: { displayName: string | null; legalFirstName: string; legalLastName: string }): string {
  return doctor.displayName ?? `${doctor.legalFirstName} ${doctor.legalLastName}`;
}

export function patientFullName(patient: { firstName: string; lastNamePaternal: string; lastNameMaternal: string | null }): string {
  return [patient.firstName, patient.lastNamePaternal, patient.lastNameMaternal].filter(Boolean).join(" ");
}
