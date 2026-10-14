"use client";

import { useCallback } from "react";
import { useI18n } from "./context";
import { getDictionary } from "./dictionaries";

// Traduce el nombre de una especialidad por su código, con respaldo
// al nombre que mandó el servidor. Un código nuevo en el catálogo no
// deja un hueco en pantalla: se muestra en español hasta que alguien
// lo agregue a dictionaries/*/catalogos.ts.
export function useSpecialtyName(): (code: string | null | undefined, fallback: string | null | undefined) => string {
  const { locale } = useI18n();
  return useCallback(
    (code, fallback) => {
      if (!code) return fallback ?? "";
      const names = getDictionary(locale).catalogos.especialidades as Record<string, string | undefined>;
      return names[code] ?? fallback ?? code;
    },
    [locale]
  );
}
