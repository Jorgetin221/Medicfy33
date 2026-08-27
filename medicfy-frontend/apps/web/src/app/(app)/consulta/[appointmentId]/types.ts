// DOC-06 — formas de solo lectura del lado del cliente, reflejan lo
// que appointment-state-machine.service.ts (findByIdWithDetails) y
// clinical-encounter.service.ts (getById) ya devuelven.
export interface AppointmentDetail {
  id: string;
  patientId: string;
  doctorId: string;
  status: "PENDING_PAYMENT" | "SCHEDULED" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED_BY_PATIENT" | "CANCELLED_BY_DOCTOR" | "NO_SHOW";
  startsAt: string;
  endsAt: string;
  completedWithoutNoteReason: string | null;
  patient: {
    firstName: string;
    lastNamePaternal: string;
    lastNameMaternal: string | null;
    medicfyId: string;
    birthDate: string;
    sexAtBirth: "F" | "M";
  };
  service: { name: string; durationMinutes: number };
  encounter: { id: string; status: "DRAFT" | "SIGNED"; encounterType: EncounterType } | null;
}

export type EncounterType = "FIRST_VISIT" | "FOLLOW_UP" | "TELECONSULTATION" | "URGENT";

export interface ClinicalNoteRecord {
  id: string;
  chiefComplaint: string;
  currentIllness: string;
  vitals: Record<string, number | undefined>;
  physicalExam: string | null;
  assessment: string;
  plan: string;
  prognosis: string | null;
  // Prompt 37 (F4): viven en la nota firmada; de aquí sale el PDF de
  // indicaciones al paciente.
  patientInstructions: string | null;
  suggestedFollowUpDays: number | null;
  createdAt: string;
}

export interface EncounterDiagnosisRecord {
  id: string;
  icd10Code: string | null;
  codeAbsentReason: string | null;
  description: string;
  diagnosisType: "PRINCIPAL" | "SECONDARY";
  certainty: "SUSPECTED" | "CONFIRMED";
}

export interface EncounterDetail {
  id: string;
  patientId: string;
  encounterType: EncounterType;
  status: "DRAFT" | "SIGNED";
  draftContent: Record<string, unknown>;
  startedAt: string;
  signedAt: string | null;
  notes: ClinicalNoteRecord[];
  diagnoses: EncounterDiagnosisRecord[];
}

export function patientFullName(patient: AppointmentDetail["patient"]): string {
  return [patient.firstName, patient.lastNamePaternal, patient.lastNameMaternal].filter(Boolean).join(" ");
}

export function patientAgeYears(birthDate: string): number {
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const hadBirthday = now.getUTCMonth() > birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() >= birth.getUTCDate());
  if (!hadBirthday) age -= 1;
  return age;
}

export const ENCOUNTER_TYPE_LABEL: Record<EncounterType, string> = {
  FIRST_VISIT: "Historia clínica (primera vez)",
  FOLLOW_UP: "Nota de evolución (seguimiento)",
  TELECONSULTATION: "Teleconsulta",
  URGENT: "Urgencia",
};
