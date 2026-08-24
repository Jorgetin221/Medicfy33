// spec M2 validation table: "Biografía: 50–2,000 caracteres, filtro de
// datos de contacto (evita que el médico ponga su teléfono para
// saltarse la plataforma)."
const PHONE_LIKE = /(\+?\d[\s.-]?){7,}/;
const EMAIL_LIKE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

export function containsContactInfo(text: string): boolean {
  return PHONE_LIKE.test(text) || EMAIL_LIKE.test(text);
}
