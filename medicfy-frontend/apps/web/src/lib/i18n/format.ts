import { INTL_LOCALE, type Locale } from "./config";

// La zona horaria NO depende del idioma. Un médico en Guadalajara
// atiende en horario de la Ciudad de México aunque lea la interfaz en
// inglés: cambiar el idioma nunca debe mover la hora de una cita.
export const MX_TIME_ZONE = "America/Mexico_City";

function fmt(locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: MX_TIME_ZONE, ...options });
}

export function formatDate(locale: Locale, value: string | Date, options: Intl.DateTimeFormatOptions): string {
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

export function formatNumber(locale: Locale, value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], options).format(value);
}

// Clave de día en formato ISO (YYYY-MM-DD) para <input type="date"> y
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
