// UTC-safe: reads UTC components directly, not local time (same
// gotcha already documented in birthDate.ts — local-time getters
// would shift the boundary depending on the server's timezone).
export function calculateAge(birthDate: Date, now: Date = new Date()): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const hasHadBirthdayThisYear =
    now.getUTCMonth() > birthDate.getUTCMonth() ||
    (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() >= birthDate.getUTCDate());
  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }
  return age;
}

// §6.4 "Menor de edad" caso límite: <18 años exige patient_guardians.
export function isMinor(birthDate: Date, now: Date = new Date()): boolean {
  return calculateAge(birthDate, now) < 18;
}
