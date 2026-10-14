import { cookies } from "next/headers";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "./config";
import { getDictionary, type MessageKey } from "./dictionaries";
import { interpolate, lookup, type TranslationParams } from "./types";

// Para los cuatro componentes de servidor que quedan (layout raíz,
// layout de (app), /para-medicos y /dr/[slug]). El resto de la app es
// "use client" y usa useT().
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return resolveLocale(store.get(LOCALE_COOKIE)?.value);
}

export function createTranslator(locale: Locale) {
  const dictionary = getDictionary(locale);
  return (key: MessageKey, params?: TranslationParams): string =>
    interpolate(lookup(dictionary, key), params);
}

export async function getTranslator() {
  return createTranslator(await getLocale());
}
