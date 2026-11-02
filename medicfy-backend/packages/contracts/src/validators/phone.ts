// spec M1 validation table: "E.164, prefijo +52, 10 dígitos nacionales".
const MX_E164 = /^\+52\d{10}$/;
const MX_NATIONAL_DIGITS = 10;
const MX_COUNTRY_CODE = "52";
// Prefijo de celular que México dejó de usar en 2019 ("+52 1 33..."):
// todavía aparece en números capturados a mano o copiados de WhatsApp.
const LEGACY_MX_MOBILE_PREFIX = "1";

export function isValidMxPhoneE164(phone: string): boolean {
  return MX_E164.test(phone);
}

// Normaliza un teléfono mexicano a E.164 (+52 + 10 dígitos). Acepta
// "33 1234 5678", "3312345678", "52 33 1234 5678", "+52 1 33 1234 5678"
// y variantes con guiones/paréntesis. Nunca adivina otro país: si no
// queda un número mexicano válido devuelve null, y el llamador lo trata
// como "no se pudo normalizar" (nunca como coincidencia).
//
// Única fuente de verdad: los esquemas de entrada, el registro, la
// comparación de coincidencias y el script de normalización de datos
// existentes usan esta misma función.
export function normalizeMxPhoneToE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  let national: string | null = null;
  if (digits.length === MX_NATIONAL_DIGITS) {
    national = digits;
  } else if (digits.length === MX_NATIONAL_DIGITS + 2 && digits.startsWith(MX_COUNTRY_CODE)) {
    national = digits.slice(2);
  } else if (digits.length === MX_NATIONAL_DIGITS + 3 && digits.startsWith(MX_COUNTRY_CODE + LEGACY_MX_MOBILE_PREFIX)) {
    national = digits.slice(3);
  }
  if (!national) return null;
  const e164 = `+${MX_COUNTRY_CODE}${national}`;
  return isValidMxPhoneE164(e164) ? e164 : null;
}

// Para z.preprocess: normaliza si puede y, si no, deja el valor tal
// cual para que la validación de formato lo rechace con su mensaje.
export function normalizeMxPhoneInput(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return normalizeMxPhoneToE164(value) ?? value;
}
