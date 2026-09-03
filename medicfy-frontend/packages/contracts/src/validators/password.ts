// Regla de negocio: mínimo 8 caracteres, sin más requisito de
// composición ni medidor de fortaleza (decisión explícita del
// producto — versión anterior exigía ≥12 + zxcvbn ≥3).
const MIN_LENGTH = 8;

export function isStrongPassword(password: string): boolean {
  return password.length >= MIN_LENGTH;
}
