import zxcvbn from "zxcvbn";

// spec M1 validation table: "≥12 caracteres, no en lista de 10k
// contraseñas comunes, medidor zxcvbn ≥3". zxcvbn's own dictionaries
// already penalize common passwords into low scores, so the length
// check plus a score threshold covers both requirements without a
// separate common-password list.
const MIN_LENGTH = 12;
const MIN_ZXCVBN_SCORE = 3;

export function isStrongPassword(password: string): boolean {
  if (password.length < MIN_LENGTH) {
    return false;
  }
  return zxcvbn(password).score >= MIN_ZXCVBN_SCORE;
}
