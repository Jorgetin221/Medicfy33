import { es, type Dictionary } from "./dictionaries/es";
import { en } from "./dictionaries/en";
import type { Locale } from "./config";
import type { TranslationKey } from "./types";

export type { Dictionary };

// La clave de traducción, tipada a partir del diccionario español.
//
// `validacion` queda fuera: sus claves son el mensaje español literal
// y traen puntos y espacios ("CURP inválida."), que romperían la
// resolución por ruta con punto de lookup(). Se lee directo del
// diccionario en lib/i18n/validation.ts, no con t().
export type MessageKey = TranslationKey<Omit<Dictionary, "validacion">>;

const DICTIONARIES: Record<Locale, Dictionary> = { es, en };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}
