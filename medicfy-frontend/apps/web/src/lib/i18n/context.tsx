"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  HTML_LANG,
  type Locale,
} from "./config";
import { getDictionary, type MessageKey } from "./dictionaries";
import { interpolate, lookup, type TranslationParams } from "./types";
import { setRuntimeLocale } from "./runtime-locale";

export type TranslateFn = (key: MessageKey, params?: TranslationParams) => string;

interface I18nValue {
  locale: Locale;
  t: TranslateFn;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

// El servidor ya resolvió el idioma desde la cookie y lo pasa como
// initialLocale, así que el primer render del cliente coincide con el
// del servidor — sin parpadeo de español a inglés al hidratar.
export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // api-client.ts vive fuera de React y lee de aquí. Se fija en el
  // cuerpo del render, no en un efecto: una petición disparada en el
  // primer render ya debe salir con el idioma correcto.
  setRuntimeLocale(locale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    setRuntimeLocale(next);
    // document.cookie y no una llamada a la API: la preferencia de
    // idioma no es dato clínico y no necesita viajar al servidor más
    // que para que el siguiente render del servidor la respete.
    try {
      document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=${LOCALE_COOKIE_MAX_AGE};samesite=lax`;
    } catch {
      // Sin cookies el idioma dura lo que la pestaña. Degradado
      // aceptable: es una preferencia de interfaz.
    }
    // Los lectores de pantalla deciden la pronunciación por este
    // atributo. Si no se actualiza, una interfaz en inglés se lee con
    // fonética española.
    if (typeof document !== "undefined") {
      document.documentElement.lang = HTML_LANG[next];
    }
  }, []);

  const value = useMemo<I18nValue>(() => {
    const dictionary = getDictionary(locale);
    return {
      locale,
      setLocale,
      t: (key, params) => interpolate(lookup(dictionary, key), params),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n debe usarse dentro de <I18nProvider>.");
  }
  return ctx;
}

// Atajo para los componentes que solo traducen y no necesitan saber
// en qué idioma están — la mayoría.
export function useT(): TranslateFn {
  return useI18n().t;
}

export { DEFAULT_LOCALE };
export type { Locale };
