// spec M1 validation table: "RFC 5322, ≤254, normalizado a minúsculas".
// Full RFC 5322 grammar is impractical to hand-validate; Zod's .email()
// (used in the schemas that consume this) covers the practical subset
// used industry-wide. This helper covers the length cap and
// normalization the spec calls out explicitly.
export const MAX_EMAIL_LENGTH = 254;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
