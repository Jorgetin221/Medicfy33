// M4-RN-001/M4-RN-007: "ningún cálculo de horario se hace en el
// navegador" y "la librería de zonas horarias debe usarse igualmente
// (IANA America/Mexico_City), nunca offsets fijos" — aunque México no
// aplica horario de verano desde 2022, el offset se resuelve siempre
// vía Intl (el tzdata IANA que Node trae incluido), nunca hardcodeado
// como "-6". Sin dependencia nueva: Intl.DateTimeFormat con
// timeZone ya cubre esto.
export const PRACTICE_TIME_ZONE = "America/Mexico_City";

// Offset (en minutos, positivo = al este de UTC) de timeZone respecto
// a UTC, en el instante `at`.
function getTimeZoneOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

// Convierte una fecha calendario local (YYYY-MM-DD) + minutos desde
// medianoche local, en el instante UTC correspondiente. Dos pasadas:
// la segunda recalcula el offset sobre el instante ya corregido (no
// sobre la adivinanza inicial) para quedar exacta incluso si
// timeZone cruzara un cambio de horario de verano — no es el caso de
// America/Mexico_City hoy, pero la función es correcta en general,
// no solo "porque México no usa DST".
export function zonedDateAndMinutesToUtc(localDateStr: string, minutesSinceMidnight: number, timeZone: string = PRACTICE_TIME_ZONE): Date {
  const [year, month, day] = localDateStr.split("-").map(Number);
  const hours = Math.floor(minutesSinceMidnight / 60);
  const minutes = minutesSinceMidnight % 60;
  const naiveUtcGuess = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, hours, minutes));

  const firstPassOffset = getTimeZoneOffsetMinutes(naiveUtcGuess, timeZone);
  const firstPass = new Date(naiveUtcGuess.getTime() - firstPassOffset * 60_000);
  const refinedOffset = getTimeZoneOffsetMinutes(firstPass, timeZone);
  return new Date(naiveUtcGuess.getTime() - refinedOffset * 60_000);
}

// Fecha calendario (YYYY-MM-DD) de `at` en timeZone. Sprint 5c: DOC-01
// "agenda del día" necesita un default de "hoy" para su carga inicial
// — se calcula aquí, no en el navegador, por la misma regla de
// M4-RN-001/007 de arriba.
export function todayInTimeZone(timeZone: string = PRACTICE_TIME_ZONE, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Suma `days` a una fecha calendario (YYYY-MM-DD). Aritmética de
// calendario pura (sin resolver zona horaria alguna) — usada para
// completar el rango por defecto de GET /doctors/{id}/availability
// cuando `to` se omite.
export function addDaysToDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const shifted = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days));
  return shifted.toISOString().slice(0, 10);
}
