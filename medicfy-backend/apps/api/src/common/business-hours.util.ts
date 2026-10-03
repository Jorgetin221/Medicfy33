const MX_TIME_ZONE = "America/Mexico_City";

// M13-CA-003 ("la cola de verificación muestra antigüedad y alerta a
// las 24 h hábiles") y M13-RN-005 (métricas de antigüedad de cola).
// La especificación no define más detalle — interpretación operativa:
// se cuentan horas de reloj transcurridas excluyendo sábado y domingo
// completos (huso America/Mexico_City), sin modelar un horario de
// oficina dentro del día. No es un cálculo legal, es un umbral para
// que el admin priorice.
//
// CLAUDE.md §4 ("ningún cálculo de horario en el navegador") es la
// razón de que esto viva en el servidor — el frontend solo formatea
// el número que este módulo ya calculó.
// Construir un Intl.DateTimeFormat es caro, y businessHoursSince lo
// consultaba una vez por hora transcurrida, por cada médico en la cola
// de verificación: con la cola real eso llevaba GET /admin/metrics a
// timeout (~237 s medidos). El formateador no guarda estado entre
// llamadas, así que se construye una sola vez y se reutiliza; el
// resultado es idéntico (lo fija business-hours.spec.ts contra la
// implementación anterior).
const MX_WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-US", { timeZone: MX_TIME_ZONE, weekday: "short" });

export function isMexicoCityWeekend(date: Date): boolean {
  const weekday = MX_WEEKDAY_FORMATTER.format(date);
  return weekday === "Sat" || weekday === "Sun";
}

export function businessHoursSince(start: Date, now: Date): number {
  let hours = 0;
  const cursor = new Date(start);
  while (cursor.getTime() < now.getTime()) {
    if (!isMexicoCityWeekend(cursor)) hours += 1;
    cursor.setTime(cursor.getTime() + 60 * 60 * 1000);
  }
  return hours;
}
