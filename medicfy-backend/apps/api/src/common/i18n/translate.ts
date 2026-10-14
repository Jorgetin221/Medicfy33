import { DEFAULT_LOCALE, type Locale } from "./locale";
import { MESSAGES_EN, MESSAGE_PATTERNS_EN } from "./messages.en";

// Traduce un mensaje de error al idioma pedido. Español es la fuente,
// así que para "es" no hay nada que hacer.
//
// Un mensaje sin traducción sale en español en vez de desaparecer: el
// médico necesita saber POR QUÉ no se pudo firmar una nota, aunque sea
// en el idioma equivocado.
export function translateMessage(message: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return message;

  const exact = MESSAGES_EN[message];
  if (exact) return exact;

  for (const { pattern, en } of MESSAGE_PATTERNS_EN) {
    const match = message.match(pattern);
    if (match) return en(match);
  }

  return message;
}
