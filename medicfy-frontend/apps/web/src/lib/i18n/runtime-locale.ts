import { DEFAULT_LOCALE, INTL_LOCALE, type Locale } from "./config";

// El idioma activo, fuera de React.
//
// lib/api-client.ts no es un componente y no puede leer el contexto,
// pero necesita el idioma para dos cosas: traducir sus propios
// mensajes (los de red, que genera él, no el servidor) y mandar
// Accept-Language para que el servidor responda ya traducido.
// I18nProvider lo mantiene al día; nadie más debería escribirlo.
let currentLocale: Locale = DEFAULT_LOCALE;

export function setRuntimeLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getRuntimeLocale(): Locale {
  return currentLocale;
}

// Valor del header Accept-Language. El idioma elegido primero y
// español como respaldo: si el servidor todavía no traduce un
// mensaje, responde en español en vez de en algo que nadie pidió.
export function acceptLanguageHeader(): string {
  const tag = INTL_LOCALE[currentLocale];
  return currentLocale === DEFAULT_LOCALE ? tag : `${tag}, ${INTL_LOCALE[DEFAULT_LOCALE]};q=0.8`;
}
