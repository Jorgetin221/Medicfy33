// spec M1 validation table: "Entre hoy−120 años y hoy".
const MAX_AGE_YEARS = 120;

export function isValidBirthDate(date: Date, now: Date = new Date()): boolean {
  if (date > now) {
    return false;
  }
  // UTC-safe: setFullYear/getFullYear read local time, which would
  // shift the boundary depending on the server's timezone.
  const minDate = new Date(now);
  minDate.setUTCFullYear(minDate.getUTCFullYear() - MAX_AGE_YEARS);
  return date >= minDate;
}
