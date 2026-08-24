// M4 §6.4: availability_rules stores start/end as minutes-since-local-
// midnight (see prisma/schema.prisma's AvailabilityRule comment) —
// HH:MM is only the wire format at the API boundary.
const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeOfDay(value: string): boolean {
  return TIME_OF_DAY_PATTERN.test(value);
}

export function timeOfDayToMinutes(value: string): number {
  const match = TIME_OF_DAY_PATTERN.exec(value);
  if (!match || !match[1] || !match[2]) {
    throw new Error(`invalid time-of-day string: ${value}`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function minutesToTimeOfDay(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}
