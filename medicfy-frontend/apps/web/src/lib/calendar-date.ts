// Aritmética de fechas de calendario para DateInput. Todo opera sobre
// claves ISO "YYYY-MM-DD" y enteros año/mes/día en UTC — nunca sobre
// la hora local del navegador (CLAUDE.md §4: ningún cálculo de horario
// en el navegador). Una fecha de nacimiento no tiene zona horaria.

export interface CalendarDate {
  year: number;
  // 0–11, como Date.
  month: number;
  day: number;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

export function toIso(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month + 1)}-${pad(day)}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

// null si no es una fecha real (31 de febrero, mes 13…).
export function parseIso(iso: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (month < 0 || month > 11 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

// 0 = domingo.
export function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month, day)).getUTCDay();
}

export function addDays(iso: string, amount: number): string {
  const date = parseIso(iso);
  if (!date) return iso;
  const next = new Date(Date.UTC(date.year, date.month, date.day + amount));
  return toIso(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate());
}

// El día se ajusta al último del mes destino (31 ene + 1 mes = 28/29 feb).
export function addMonths(iso: string, amount: number): string {
  const date = parseIso(iso);
  if (!date) return iso;
  const first = new Date(Date.UTC(date.year, date.month + amount, 1));
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth();
  return toIso(year, month, Math.min(date.day, daysInMonth(year, month)));
}

export function clampIso(iso: string, min?: string, max?: string): string {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

export function isWithin(iso: string, min?: string, max?: string): boolean {
  return (!min || iso >= min) && (!max || iso <= max);
}

// Orden de los segmentos que se teclean: día/mes/año en español,
// mes/día/año en inglés (la convención de cada idioma).
export type SegmentOrder = "dmy" | "mdy";

export function formatTyped(iso: string, order: SegmentOrder): string {
  const date = parseIso(iso);
  if (!date) return "";
  const dd = pad(date.day);
  const mm = pad(date.month + 1);
  return order === "dmy" ? `${dd}/${mm}/${date.year}` : `${mm}/${dd}/${date.year}`;
}

// Solo dígitos, con las diagonales puestas conforme se escribe. La
// diagonal aparece cuando ya hay un dígito después — así borrar con
// retroceso nunca se atora en "17/".
export function maskTyped(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

// "" mientras el texto no sea una fecha completa y real.
export function parseTyped(text: string, order: SegmentOrder): string {
  const digits = text.replace(/\D/g, "");
  if (digits.length !== 8) return "";
  const first = Number(digits.slice(0, 2));
  const second = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4));
  const [day, month] = order === "dmy" ? [first, second] : [second, first];
  const iso = toIso(year, month - 1, day);
  return year >= 1000 && parseIso(iso) ? iso : "";
}

// Semanas del mes como filas de 7 celdas; null = celda vacía (días de
// otro mes no se pintan, como en el calendario de Apple).
export function monthMatrix(year: number, month: number): (string | null)[][] {
  const leading = weekdayOf(year, month, 1);
  const total = daysInMonth(year, month);
  const cells: (string | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: total }, (_, i) => toIso(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
