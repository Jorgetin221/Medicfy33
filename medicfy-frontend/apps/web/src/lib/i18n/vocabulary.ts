"use client";

import { useCallback } from "react";
import { useI18n } from "./context";
import { getDictionary } from "./dictionaries";

type VocabularyGroup = keyof ReturnType<typeof getDictionary>["clinico"]["vocabulario"];

// Traduce un valor de un vocabulario clínico cerrado de
// @medicfy/contracts (tipo de alergia, vía de administración,
// severidad, fuente del dato…). La CLAVE es el contrato con el
// servidor y no cambia; esto solo decide cómo se lee.
//
// Un valor que el servidor mande y no esté en el diccionario vuelve
// tal cual: un desplegable con un hueco sería peor que uno con una
// opción en español.
export function useVocabulary(): (group: VocabularyGroup, value: string) => string {
  const { locale } = useI18n();
  return useCallback(
    (group, value) => {
      const table = getDictionary(locale).clinico.vocabulario[group] as Record<string, string | undefined>;
      return table[value] ?? value;
    },
    [locale]
  );
}
