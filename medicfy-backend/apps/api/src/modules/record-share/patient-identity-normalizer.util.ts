import { normalizeMxPhoneToE164 } from "@medicfy/contracts";

// PR-EXP-02 (D-EXP-04): normaliza lo que el médico escribe antes de
// compararlo contra Patient. A propósito NO reutiliza
// catalog/term-normalizer.util.ts — ese normalizador reduce plurales
// en español ("Carlos" → "Carlo" por su regla de "-os"), correcto para
// vocabulario clínico pero destructivo para nombres de personas.
const COMBINING_DIACRITICAL_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/**
 * Minúsculas, sin acentos (incluida la ñ — aquí no hace falta
 * protegerla: no es la llave de un índice único, solo se usa para
 * comparar dos cadenas), espacios colapsados y recortados.
 */
export function normalizePersonName(text: string): string {
  const withoutAccents = text.normalize("NFD").replace(COMBINING_DIACRITICAL_MARKS, "");
  return withoutAccents.toLowerCase().trim().replace(/\s+/g, " ");
}

// La normalización de teléfono vive en @medicfy/contracts (una sola
// regla para el registro, el alta por el médico, las coincidencias y
// el script de datos). Se reexporta para no cambiar a los llamadores
// de este track.
export { normalizeMxPhoneToE164 };
