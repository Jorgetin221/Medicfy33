// Idioma de la interfaz. Decisión del usuario (2026-10-14): la
// plataforma se puede ver en inglés, pero NADA de esto toca los
// documentos con validez legal — receta, orden de laboratorio e
// indicaciones se emiten siempre en español (NOM-004, art. 33 del
// Reglamento de Insumos para la Salud, R6). Tampoco se traduce el
// texto clínico que escribió el médico: eso es dato, no interfaz.

export const LOCALES = ["es", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "es";

// Lee el servidor para pintar la primera página ya traducida, y el
// cliente para recordar la elección. No es dato clínico, así que la
// prohibición de §5 sobre localStorage no aplica — aun así vive en
// cookie y no en storage, para que el render del servidor coincida
// con el del cliente y no haya parpadeo de idioma.
export const LOCALE_COOKIE = "medicfy_locale";

// Un año: la elección de idioma no caduca con la sesión.
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// El atributo lang de <html>. Importa para lectores de pantalla
// (pronunciación) y para la separación silábica del navegador.
export const HTML_LANG: Record<Locale, string> = {
  es: "es-MX",
  en: "en-US",
};

// Etiqueta de formato para Intl.*. Deliberadamente distinta de
// HTML_LANG como constante aparte: si mañana se agrega un idioma, el
// formato de fecha y el atributo lang pueden divergir.
export const INTL_LOCALE: Record<Locale, string> = {
  es: "es-MX",
  en: "en-US",
};

// Cómo se nombra cada idioma en su propio idioma — nunca traducido.
// Un selector que dice "Spanish" a alguien que no lee inglés no sirve.
export const LOCALE_LABELS: Record<Locale, string> = {
  es: "Español",
  en: "English",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function resolveLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
