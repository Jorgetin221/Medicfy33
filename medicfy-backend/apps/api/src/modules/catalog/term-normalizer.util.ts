// Prompt 8: "minúsculas, sin acentos, sin puntuación final, colapso de
// espacios múltiples", más número gramatical (singular/plural).
//
// DECISIÓN (26 ago 2026, tras la auditoría del Bloque 0). El prompt 8
// exige que tres grupos se detecten como duplicados. Sólo dos son un
// problema de normalización:
//
//   "hipotiroidismo" / "HIPOTIROIDISMO"      → formato   (aquí)
//   "Dislipidemias"  / "Dislipidemia"        → número    (aquí)
//   "Tiroideas."     / "hipotiroidismo"      → sinónimo  (curaduría)
//   "Ninguno"/"Ninguna"/"Negados"/"SANO"     → sinónimo  (curaduría)
//
// Los dos últimos grupos no comparten raíz: ningún normalizador de
// forma puede unir "Negados" con "SANO" sin un diccionario, y un
// diccionario dentro del normalizador es curaduría disfrazada de
// algoritmo. Van al campo `synonyms`, y el chequeo de alta los
// consulta — ver ClinicalCatalogService.create().
//
// RegExp constructor + string, no un literal /.../ : escribir el
// rango de marcas diacríticas combinantes (U+0300-U+036F) como
// literal en el código fuente es frágil — cualquier editor/encoding
// puede corromper caracteres invisibles. Con new RegExp("\\u0300-...")
// el rango queda como texto ASCII legible, sin ambigüedad.
const COMBINING_DIACRITICAL_MARKS = new RegExp("[\\u0300-\\u036f]", "g");
const TRAILING_PUNCTUATION = /[.,;:!¡¿?]+$/;

// La ñ NO es una vocal acentuada: es una letra propia del español.
// NFD la descompone en "n" + U+0303, que cae dentro del rango de
// diacríticos combinantes que se elimina justo abajo. Sin protegerla,
// "año" y "ano" colapsan al mismo término normalizado —y "muñeca" con
// "muneca"—, y el índice único (domain, normalizedTerm) convierte ese
// falso positivo en un rechazo que el curador no puede resolver: no
// puede dar de alta el término legítimo ni ve con qué chocó.
// El centinela es un carácter de control que no aparece en texto
// clínico y que NFD no descompone.
const N_TILDE = "ñ";
const N_TILDE_SENTINEL = "\u0001";
const N_TILDE_SENTINEL_PATTERN = new RegExp("\\u0001", "g");

// Español clínico terminado en -as/-os que ya es singular. La lista es
// corta a propósito: la regla de número de abajo sólo actúa sobre
// -as/-os, donde el plural español es inequívoco, así que las
// excepciones son pocas y conocidas.
const INVARIABLES = new Set(["atlas", "caos", "bilis", "sepsis"]);

/**
 * Forma normalizada de un término de catálogo. Se calcula SIEMPRE en
 * el servidor y nunca viaja desde el cliente, igual que el IMC y las
 * escalas.
 */
export function normalizeTerm(text: string): string {
  const nTildeProtected = text.replace(/ñ/g, N_TILDE_SENTINEL).replace(/Ñ/g, N_TILDE_SENTINEL);

  const withoutAccents = nTildeProtected
    .normalize("NFD")
    .replace(COMBINING_DIACRITICAL_MARKS, "")
    .replace(N_TILDE_SENTINEL_PATTERN, N_TILDE);

  const withoutTrailingPunctuation = withoutAccents.toLowerCase().trim().replace(TRAILING_PUNCTUATION, "");
  const collapsed = withoutTrailingPunctuation.replace(/\s+/g, " ").trim();

  return collapsed.split(" ").map(toSingular).join(" ");
}

/**
 * Reduce a singular SÓLO donde el plural español es inequívoco: una
 * palabra terminada en -as o en -os forma su plural añadiendo "s" a la
 * vocal átona final, así que quitarla siempre devuelve el singular
 * ("dislipidemias" → "dislipidemia", "medicamentos" → "medicamento").
 *
 * Todo lo demás se deja intacto a propósito:
 *
 *   -es  es ambiguo y no se resuelve por sufijo. "doctores" pierde
 *        "es", "lentes" pierde sólo la "s", y "diabetes" no pierde
 *        nada porque ya es singular. Tocar -es produce falsos
 *        positivos que el índice único vuelve irresolubles.
 *   -is  terminación singular gigantesca en medicina: artritis,
 *        dosis, crisis, analisis, psoriasis, tuberculosis.
 *   -us  lupus, virus, tifus.
 *
 * El sesgo es deliberado: dejar pasar un duplicado —que el reporte de
 * duplicados y el curador atrapan— es preferible a rechazar un término
 * legítimo, que no tiene salida.
 */
function toSingular(word: string): string {
  if (word.length < 4) return word;
  if (INVARIABLES.has(word)) return word;
  if (/(?:is|us|es)$/.test(word)) return word;
  if (/[ao]s$/.test(word)) return word.slice(0, -1);
  return word;
}
