// spec M1 §3.2 [DECISIÓN POR DEFECTO]: SEP registry lookup is manual
// admin review in the MVP, not automated. This is format validation
// only — "7–8 dígitos numéricos".
const CEDULA_FORMAT = /^\d{7,8}$/;

export function isValidCedulaFormat(cedula: string): boolean {
  return CEDULA_FORMAT.test(cedula);
}
