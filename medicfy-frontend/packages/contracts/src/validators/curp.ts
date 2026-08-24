// CURP structural + check-digit validation, per spec M1 validation table:
// "18 caracteres, algoritmo de dígito verificador". State-code catalog
// is intentionally not cross-checked — the spec asks for the check
// digit algorithm specifically, not a full state registry.

const CURP_CHARSET = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
const CURP_STRUCTURE = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;

function curpCheckDigit(first17: string): number {
  let sum = 0;
  for (let position = 1; position <= 17; position++) {
    const char = first17[position - 1] as string;
    const value = CURP_CHARSET.indexOf(char);
    const weight = 18 - position;
    sum += value * weight;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidCurp(rawCurp: string): boolean {
  const curp = rawCurp.toUpperCase();
  if (!CURP_STRUCTURE.test(curp)) {
    return false;
  }
  const expectedDigit = curpCheckDigit(curp.slice(0, 17));
  return String(expectedDigit) === curp[17];
}
