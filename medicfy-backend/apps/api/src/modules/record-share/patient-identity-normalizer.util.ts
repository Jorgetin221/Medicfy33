import { isValidMxPhoneE164 } from "@medicfy/contracts";

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

// Acepta "+52 55 1234 5678", "5551234567", "52 55 1234 5678", etc.
// Nunca adivina el código de país si no es México — fuera de ese caso
// devuelve null y el llamador lo trata como "no se pudo normalizar"
// (nunca como coincidencia).
export function normalizeMxPhoneToE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const candidates = [digits, `52${digits}`];
  for (const d of candidates) {
    if (d.length === 12 && d.startsWith("52")) {
      const e164 = `+${d}`;
      if (isValidMxPhoneE164(e164)) return e164;
    }
  }
  return null;
}
