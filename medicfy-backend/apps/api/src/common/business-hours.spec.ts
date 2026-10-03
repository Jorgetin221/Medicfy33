import { describe, expect, it } from "vitest";
import { businessHoursSince, isMexicoCityWeekend } from "./business-hours.util";

// M13-CA-003 / M13-RN-005. businessHoursSince corre una vez por médico
// en la cola de verificación dentro de GET /admin/metrics, así que su
// costo se multiplica por el tamaño de la cola. La versión original
// construía un Intl.DateTimeFormat en CADA iteración horaria, lo que
// hacía que el endpoint se fuera a timeout con una cola real.
//
// Estas pruebas fijan las dos cosas que importan al optimizarla: que el
// resultado no cambie, y que el costo deje de ser prohibitivo.

const ONE_HOUR_MS = 60 * 60 * 1000;
const MX_TIME_ZONE = "America/Mexico_City";

// Implementación de referencia: la original, hora por hora y
// construyendo el formateador cada vez. Se conserva aquí —y solo aquí—
// para poder exigir que la versión optimizada dé exactamente lo mismo.
function referenceBusinessHoursSince(start: Date, now: Date): number {
  let hours = 0;
  const cursor = new Date(start);
  while (cursor.getTime() < now.getTime()) {
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: MX_TIME_ZONE, weekday: "short" }).format(cursor);
    if (weekday !== "Sat" && weekday !== "Sun") hours += 1;
    cursor.setTime(cursor.getTime() + ONE_HOUR_MS);
  }
  return hours;
}

describe("businessHoursSince — equivalencia con la implementación de referencia", () => {
  // Rangos elegidos para cruzar fines de semana completos, empezar en
  // sábado y domingo, y cubrir desde horas sueltas hasta dos meses.
  const cases: { nombre: string; start: Date; now: Date }[] = [
    { nombre: "unas horas de un martes", start: new Date("2026-09-01T10:00:00Z"), now: new Date("2026-09-01T18:00:00Z") },
    { nombre: "cruzando un fin de semana", start: new Date("2026-09-04T12:00:00Z"), now: new Date("2026-09-08T12:00:00Z") },
    { nombre: "empezando en sábado", start: new Date("2026-09-05T00:00:00Z"), now: new Date("2026-09-09T00:00:00Z") },
    { nombre: "empezando en domingo", start: new Date("2026-09-06T00:00:00Z"), now: new Date("2026-09-10T00:00:00Z") },
    { nombre: "una semana exacta", start: new Date("2026-09-07T08:30:00Z"), now: new Date("2026-09-14T08:30:00Z") },
    { nombre: "dos meses, como el médico más antiguo de la cola", start: new Date("2026-08-13T06:15:00Z"), now: new Date("2026-10-03T06:15:00Z") },
  ];

  for (const { nombre, start, now } of cases) {
    it(`da el mismo número que la referencia: ${nombre}`, () => {
      expect(businessHoursSince(start, now)).toBe(referenceBusinessHoursSince(start, now));
    });
  }

  it("devuelve 0 cuando `now` no es posterior a `start`", () => {
    const t = new Date("2026-09-01T10:00:00Z");
    expect(businessHoursSince(t, t)).toBe(0);
    expect(businessHoursSince(new Date("2026-09-02T10:00:00Z"), t)).toBe(0);
  });

  it("no cuenta las horas de un sábado ni de un domingo completos", () => {
    // Sáb 2026-09-05 00:00 a lun 2026-09-07 00:00, hora de CDMX.
    const sabado = new Date("2026-09-05T06:00:00Z");
    const lunes = new Date("2026-09-07T06:00:00Z");
    expect(businessHoursSince(sabado, lunes)).toBe(0);
  });

  it("isMexicoCityWeekend distingue el fin de semana en huso de CDMX", () => {
    // 2026-09-05 05:00Z es aún viernes 23:00 en CDMX (UTC-6).
    expect(isMexicoCityWeekend(new Date("2026-09-05T05:00:00Z"))).toBe(false);
    expect(isMexicoCityWeekend(new Date("2026-09-05T07:00:00Z"))).toBe(true);
    expect(isMexicoCityWeekend(new Date("2026-09-07T07:00:00Z"))).toBe(false);
  });
});

describe("businessHoursSince — costo con una cola realista", () => {
  it("resuelve una cola de 7,642 médicos de hasta dos meses muy por debajo del timeout de 5 s", () => {
    const now = new Date("2026-10-03T12:00:00Z");
    const queue = Array.from({ length: 7642 }, (_, i) => new Date(now.getTime() - (i % 51) * 24 * ONE_HOUR_MS));

    const startedAt = Date.now();
    for (const createdAt of queue) businessHoursSince(createdAt, now);
    const elapsed = Date.now() - startedAt;

    // La implementación original tardaba ~237 s en esta misma cola. El
    // umbral se deja holgado para no volverse frágil en CI, pero sigue
    // siendo tres órdenes de magnitud por debajo de aquello.
    expect(elapsed).toBeLessThan(2000);
  });
});
