// spec M1 validation table: "E.164, prefijo +52, 10 dígitos nacionales".
const MX_E164 = /^\+52\d{10}$/;

export function isValidMxPhoneE164(phone: string): boolean {
  return MX_E164.test(phone);
}
