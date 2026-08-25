"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api-client";

// Formas de solo lectura del lado del cliente — reflejan lo que
// PatientClinicalService/ClinicalEncounterService ya devuelven
// (records/services/*.service.ts), no un contrato Zod nuevo: son
// respuestas GET, no hay body de entrada que validar.
export interface PatientSummary {
  id: string;
  medicfyId: string;
  firstName: string;
  lastNamePaternal: string;
  lastNameMaternal: string | null;
  birthDate: string;
  sexAtBirth: "F" | "M";
  bloodType: string | null;
  phoneE164: string;
  email: string;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  guardians: { guardianName: string; guardianRelation: string; guardianPhoneE164: string }[];
}

export interface PatientAllergy {
  id: string;
  patientId: string;
  substance: string;
  allergyType: string;
  reaction: string | null;
  severity: string;
  ageOfOnset: string | null;
  status: "ACTIVE" | "INACTIVE" | "RULED_OUT";
  certainty: "CONFIRMED" | "LIKELY" | "UNCERTAIN";
  source: string;
  lastReviewedAt: string;
}

export interface PatientMedication {
  id: string;
  patientId: string;
  genericName: string;
  brandName: string | null;
  dose: string;
  route: string;
  frequency: string;
  startedAt: string | null;
  suspendedAt: string | null;
  reason: string | null;
  status: "ACTIVE" | "SUSPENDED" | "COMPLETED";
  prescriber: string | null;
  source: string;
}

export interface TimelineEncounter {
  type: "encounter";
  id: string;
  encounterType: "FIRST_VISIT" | "FOLLOW_UP" | "TELECONSULTATION" | "URGENT";
  status: "DRAFT" | "SIGNED";
  startedAt: string;
  signedAt: string | null;
  doctorId: string;
}

export interface TimelinePrescriptionItem {
  genericName: string;
  brandName: string | null;
  presentation: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  controlGroup: string;
}

export interface TimelinePrescription {
  type: "prescription";
  id: string;
  folio: string;
  prescriptionType: "ELECTRONIC" | "EXTERNAL_PHYSICAL";
  // Corrección v2.1: null para prescriptionType=EXTERNAL_PHYSICAL,
  // donde ninguna de las dos rutas nuevas aplica.
  signatureRoute: "HANDWRITTEN_AFTER_PRINT" | "ELECTRONIC" | null;
  issuedAt: string;
  diagnosisSnapshot: string;
  qrVerificationToken: string | null;
  status: "ISSUED" | "CANCELLED" | "PENDING_HANDWRITTEN_SIGNATURE";
  items: TimelinePrescriptionItem[];
}

export interface TimelineLabOrder {
  type: "lab_order";
  id: string;
  folio: string;
  issuedAt: string;
  clinicalIndication: string;
  fastingRequired: boolean;
  qrVerificationToken: string;
  status: "ISSUED" | "CANCELLED" | "RESULTS_UPLOADED";
  items: { studyName: string; loincCode: string | null; notes: string | null }[];
}

// §6.7: labOrderId nullable — un resultado que el paciente ya trae de
// otro lado, subido sin pasar por una orden emitida en Medicfy.
export interface TimelineStandaloneResult {
  type: "standalone_result";
  id: string;
  labName: string | null;
  resultDate: string | null;
  uploadedAt: string;
  uploadedByRole: "DOCTOR" | "PATIENT";
  status: "PENDING_REVIEW" | "REVIEWED";
}

export interface PatientTimeline {
  encounters: TimelineEncounter[];
  prescriptions: TimelinePrescription[];
  labOrders: TimelineLabOrder[];
  standaloneResults: TimelineStandaloneResult[];
}

// M8-RN-012/§10: antecedentes heredofamiliares/personales — viven en
// el paciente, se capturan una vez y se arrastran a cada consulta,
// igual que PatientAllergy/PatientMedication arriba.
export interface PatientHistoryItem {
  id: string;
  patientId: string;
  category: "HEREDOFAMILIAR" | "PERSONAL_NO_PATOLOGICO" | "PERSONAL_PATOLOGICO";
  subtype: string;
  familyRelationship: string;
  familyRelationshipDetail: string | null;
  status: "PRESENTE" | "NEGADO" | "DESCONOCIDO" | "NO_INVESTIGADO";
  structuredValue: Record<string, unknown> | null;
  freeText: string | null;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

interface State {
  patient: PatientSummary | null;
  allergies: PatientAllergy[];
  medications: PatientMedication[];
  historyItems: PatientHistoryItem[];
  timeline: PatientTimeline | null;
  isLoading: boolean;
  error: unknown;
}

const EMPTY_STATE: State = { patient: null, allergies: [], medications: [], historyItems: [], timeline: null, isLoading: true, error: null };

// Compartido por /consulta/[appointmentId] (antecedentes visibles sin
// scroll/clic — CLAUDE.md §6) y /pacientes/[id] (expediente completo)
// — ambas pantallas necesitan exactamente estos cuatro datos del
// mismo paciente.
export function usePatientClinical(patientId: string | null, accessToken: string | null) {
  const [state, setState] = useState<State>(EMPTY_STATE);
  const [version, setVersion] = useState(0);

  const load = useCallback(() => {
    if (!patientId || !accessToken) return undefined;
    let cancelled = false;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    Promise.all([
      apiFetch<PatientSummary>(`/patients/${patientId}`, { accessToken }),
      apiFetch<PatientAllergy[]>(`/records/patients/${patientId}/allergies`, { accessToken }),
      apiFetch<PatientMedication[]>(`/records/patients/${patientId}/medications`, { accessToken }),
      apiFetch<PatientHistoryItem[]>(`/records/patients/${patientId}/history`, { accessToken }),
      apiFetch<PatientTimeline>(`/records/patients/${patientId}/timeline`, { accessToken }),
    ])
      .then(([patient, allergies, medications, historyItems, timeline]) => {
        if (!cancelled) setState({ patient, allergies, medications, historyItems, timeline, isLoading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState((prev) => ({ ...prev, isLoading: false, error }));
      });

    return () => {
      cancelled = true;
    };
  }, [patientId, accessToken]);

  useEffect(() => load(), [load, version]);

  return { ...state, reload: () => setVersion((v) => v + 1) };
}
