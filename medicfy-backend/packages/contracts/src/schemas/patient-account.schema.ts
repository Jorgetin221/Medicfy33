// Vinculación de cuentas de paciente (vista del médico y del propio
// paciente). Solo formas de respuesta: las entradas con cuerpo viven
// en identity.schema.ts (activación) y patient.schema.ts (duplicados).

export interface PatientDuplicateCandidate {
  id: string;
  medicfyId: string;
  fullName: string;
}

// Estado de la cuenta de un paciente, para la ficha del médico. El
// token de un enlace vigente nunca se puede volver a mostrar (solo se
// guarda su hash): para compartirlo de nuevo hay que generar otro.
export interface PatientAccountStatus {
  hasAccount: boolean;
  // Sin acceso de tutores en el sistema todavía: a un menor no se le
  // genera enlace (ver PatientActivationService).
  isMinor: boolean;
  pendingActivationLink: { createdAt: string; expiresAt: string } | null;
  pendingLinkRequestCount: number;
}

export interface PatientActivationLinkIssued {
  url: string;
  expiresAt: string;
}

export const PATIENT_LINK_REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type PatientLinkRequestStatus = (typeof PATIENT_LINK_REQUEST_STATUSES)[number];

export interface PatientIdentityData {
  firstName: string;
  lastNamePaternal: string;
  lastNameMaternal: string | null;
  // YYYY-MM-DD
  birthDate: string;
  sexAtBirth: "F" | "M";
  phoneE164: string;
  email: string;
}

// Lo que la persona escribió al registrarse (claimed) junto a lo que
// dice el expediente (record), para que el médico compare y decida.
export interface PatientLinkRequestView {
  id: string;
  patientId: string;
  medicfyId: string;
  status: PatientLinkRequestStatus;
  createdAt: string;
  claimed: PatientIdentityData;
  record: PatientIdentityData;
}

// GET /patients/me/link-status — lo único que ve un paciente mientras
// su vinculación está pendiente. Ningún dato del expediente.
export type OwnPatientLinkStatus = "LINKED" | "PENDING_REVIEW" | "NONE";
