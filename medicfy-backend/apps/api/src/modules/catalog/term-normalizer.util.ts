// Prompt 8 (medicfy-50-prompts.md): "minúsculas, sin acentos, sin
// puntuación final, colapso de espacios múltiples" — literal, nada
// más. Confirmado con el usuario: NO intenta resolver singular/plural
// ni sinónimos sin raíz compartida (esos casos no son un problema de
// formato — van al campo `synonyms`, curado a mano, no aquí).
//
// RegExp constructor + string, no un literal /.../ : escribir el
// rango de marcas diacríticas combinantes (U+0300-U+036F) como
// literal en el código fuente es frágil — cualquier editor/encoding
// puede corromper caracteres invisibles. Con new RegExp("\\u0300-...")
// el rango queda como texto ASCII legible, sin ambigüedad.
const COMBINING_DIACRITICAL_MARKS = new RegExp("[\\u0300-\\u036f]", "g");
const TRAILING_PUNCTUATION = /[.,;:!¡¿?]+$/;

export function normalizeTerm(text: string): string {
  const withoutAccents = text.normalize("NFD").replace(COMBINING_DIACRITICAL_MARKS, "");
  const withoutTrailingPunctuation = withoutAccents.toLowerCase().trim().replace(TRAILING_PUNCTUATION, "");
  return withoutTrailingPunctuation.replace(/\s+/g, " ").trim();
}
