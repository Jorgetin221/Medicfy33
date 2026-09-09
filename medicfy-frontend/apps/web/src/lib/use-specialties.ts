"use client";

import { useEffect, useState } from "react";
import { apiFetch, expectArray } from "./api-client";

export interface SpecialtyOption {
  id: string;
  code: string;
  nameEs: string;
  requiresSpecialtyLicense: boolean;
}

interface State {
  specialties: SpecialtyOption[];
  isLoading: boolean;
  error: unknown;
}

export function useSpecialties(): State {
  const [state, setState] = useState<State>({ specialties: [], isLoading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    apiFetch<unknown>("/specialties")
      .then((data) => {
        const specialties = expectArray<SpecialtyOption>(data);
        if (!cancelled) setState({ specialties, isLoading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ specialties: [], isLoading: false, error });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
