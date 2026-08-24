"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api-client";

export type DoctorVerificationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "IN_REVIEW"
  | "VERIFIED"
  | "VERIFIED_SPECIALTY_UNCONFIRMED"
  | "REJECTED"
  | "SUSPENDED";

export interface DoctorProfile {
  id: string;
  legalFirstName: string;
  legalLastName: string;
  professionalLicense: string;
  specialtyLicense: string | null;
  primarySpecialtyId: string | null;
  displayName: string | null;
  photoUrl: string | null;
  professionalPhone: string | null;
  professionalEmail: string | null;
  letterheadPhrase: string | null;
  logoUrl: string | null;
  signatureImageUrl: string | null;
  verificationStatus: DoctorVerificationStatus;
  verificationNotes: string | null;
}

interface State {
  doctor: DoctorProfile | null;
  isLoading: boolean;
  error: unknown;
}

// Perfil (Parte B §5): GET /doctors/me no tiene contraparte en
// useAuth() (que solo expone el token, nunca datos del médico) — cada
// pantalla que necesita el perfil lo pide aquí, mismo patrón de
// estado-objeto + bandera de cancelación que useSpecialties.
export function useDoctorProfile(accessToken: string | null): State & { reload: () => void } {
  const [state, setState] = useState<State>({ doctor: null, isLoading: true, error: null });
  const [version, setVersion] = useState(0);

  const load = useCallback(() => {
    if (!accessToken) return;
    let cancelled = false;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    apiFetch<DoctorProfile>("/doctors/me", { accessToken })
      .then((doctor) => {
        if (!cancelled) setState({ doctor, isLoading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ doctor: null, isLoading: false, error });
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => load(), [load, version]);

  return { ...state, reload: () => setVersion((v) => v + 1) };
}
