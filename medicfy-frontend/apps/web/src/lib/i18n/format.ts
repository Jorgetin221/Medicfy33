import { INTL_LOCALE, type Locale } from "./config";

// La zona horaria NO depende del idioma. Un médico en Guadalajara
// atiende en horario de la Ciudad de México aunque lea la interfaz en
// inglés: cambiar el idioma nunca debe mover la hora de una cita.
const MX_TIME_ZONE = "America/Mexico_City";

function fmt(locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: MX_TIME_ZONE, ...options });
}

function formatDate(locale: Locale, value: string | Date, options: Intl.DateTimeFormatOptions): string {
  return fmt(locale, options).format(typeof value === "string" ? new Date(value) : value);
}

export function formatDateLong(locale: Locale, value: string | Date): string {
  return formatDate(locale, value, { dateStyle: "long" });
}

export function formatDateMedium(locale: Locale, value: string | Date): string {
  return formatDate(locale, value, { dateStyle: "medium" });
}

export function formatDateTimeLong(locale: Locale, value: string | Date): string {
  return formatDate(locale, value, { dateStyle: "long", timeStyle: "short" });
}

export function formatDateTimeMedium(locale: Locale, value: string | Date): string {
  return formatDate(locale, value, { dateStyle: "medium", timeStyle: "short" });
}

export function formatTime(locale: Locale, value: string | Date): string {
  return formatDate(locale, value, { hour: "2-digit", minute: "2-digit", hour12: true });
}

// Encabezado de la agenda: "miércoles, 14 de octubre" / "Wednesday,
// October 14".
export function formatWeekdayLong(locale: Locale, value: string | Date): string {
  return formatDate(locale, value, { weekday: "long", day: "numeric", month: "long" });
}

// Clave de día en formato ISO (YYYY-MM-DD) para DateInput y
// para las llamadas a la API. Deliberadamente NO usa el idioma de la
// interfaz: es un valor de máquina, no texto para leer. Sigue en
// "en-CA" porque es la etiqueta que produce ese formato con la zona
// horaria aplicada.
export function toIsoDateKey(value: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MX_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);
}

// Mueve una clave de día (YYYY-MM-DD) n días en el calendario. Es
// aritmética de calendario pura, en UTC, sin zona horaria: el día
// "hoy" de partida ya lo dio toIsoDateKey con la zona del consultorio,
// y el servidor decide qué citas caen en ese día.
export function shiftIsoDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days));
  return shifted.toISOString().slice(0, 10);
}

// Encabezado de un día calendario (no de un instante): mediodía UTC
// cae en el mismo día en America/Mexico_City.
export function formatDateKeyWeekdayLong(locale: Locale, dateKey: string): string {
  return formatWeekdayLong(locale, `${dateKey}T12:00:00Z`);
}

// Fechas calendario sin hora (fecha de nacimiento, columnas @db.Date):
// la API las manda como medianoche UTC ("1958-03-14T00:00:00.000Z").
// Pintarlas en America/Mexico_City las corre al día anterior, así que
// se formatean en UTC: el día es el que se capturó.
export function formatCalendarDateLong(locale: Locale, value: string | Date): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: "UTC", dateStyle: "long" }).format(typeof value === "string" ? new Date(value) : value);
}
