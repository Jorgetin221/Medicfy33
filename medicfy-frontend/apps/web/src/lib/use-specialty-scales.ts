"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "./api-client";

export interface SpecialtyFieldSchemaOption {
  id: string;
  fieldKey: string;
  label: string;
  inputType: "NUMBER" | "TEXT" | "TEXTAREA" | "SELECT" | "MULTISELECT" | "BOOLEAN" | "DATE" | "COMPUTED";
  minValue: number | null;
  maxValue: number | null;
  options: { value: number; label: string }[] | { min: number; max: number; label: string }[] | null;
  computedFormula: string | null;
  displayOrder: number;
}

interface State {
  fields: SpecialtyFieldSchemaOption[];
  isLoading: boolean;
  error: unknown;
}

// Motor de escalas (GET /specialty-field-schemas) — hoy solo sección
// ESCALAS (Glasgow, Apgar). Requiere sesión, a diferencia de
// useSpecialties() — por eso lleva accessToken, mismo patrón que
// useDoctorProfile.
export function useSpecialtyScales(accessToken: string | null, section: "ESCALAS"): State {
  const [state, setState] = useState<State>({ fields: [], isLoading: true, error: null });

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;
    apiFetch<SpecialtyFieldSchemaOption[]>(`/specialty-field-schemas?section=${section}`, { accessToken })
      .then((fields) => {
        if (!cancelled) setState({ fields, isLoading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ fields: [], isLoading: false, error });
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, section]);

  return state;
}
