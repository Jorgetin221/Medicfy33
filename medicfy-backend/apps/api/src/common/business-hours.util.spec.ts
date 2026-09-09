import { describe, expect, it } from "vitest";
import { businessHoursSince, isMexicoCityWeekend } from "./business-hours.util";

// M13-CA-003: casos de borde del cálculo de "horas hábiles" — sobre
// todo el cruce de fin de semana, que es donde un off-by-one pasaría
// desapercibido hasta producción.
describe("businessHoursSince", () => {
  it("cuenta 24 horas hábiles entre lunes 9am y martes 9am (entre semana, sin fin de semana de por medio)", () => {
    const start = new Date("2026-09-07T15:00:00Z"); // lunes 9am CDMX (UTC-6)
    const now = new Date("2026-09-08T15:00:00Z"); // martes 9am CDMX
    expect(businessHoursSince(start, now)).toBe(24);
  });

  it("cuenta 24 horas hábiles entre viernes 9am y lunes 9am (72h de reloj, pero el fin de semana no cuenta)", () => {
    const start = new Date("2026-09-04T15:00:00Z"); // viernes 9am CDMX
    const now = new Date("2026-09-07T15:00:00Z"); // lunes 9am CDMX
    expect(businessHoursSince(start, now)).toBe(24);
  });

  it("devuelve 0 para el mismo instante", () => {
    const t = new Date("2026-09-08T15:00:00Z");
    expect(businessHoursSince(t, t)).toBe(0);
  });

  it("devuelve 0 para un fin de semana completo (sábado 9am a domingo 9am)", () => {
    const start = new Date("2026-09-05T15:00:00Z"); // sábado 9am CDMX
    const now = new Date("2026-09-06T15:00:00Z"); // domingo 9am CDMX
    expect(businessHoursSince(start, now)).toBe(0);
  });

  it("no cuenta horas futuras si 'now' es anterior a 'start' (devuelve 0, no negativo)", () => {
    const start = new Date("2026-09-08T15:00:00Z");
    const now = new Date("2026-09-07T15:00:00Z");
    expect(businessHoursSince(start, now)).toBe(0);
  });
});

describe("isMexicoCityWeekend", () => {
  it("identifica sábado y domingo como fin de semana", () => {
    expect(isMexicoCityWeekend(new Date("2026-09-05T15:00:00Z"))).toBe(true); // sábado
    expect(isMexicoCityWeekend(new Date("2026-09-06T15:00:00Z"))).toBe(true); // domingo
  });

  it("no marca los días entre semana como fin de semana", () => {
    expect(isMexicoCityWeekend(new Date("2026-09-07T15:00:00Z"))).toBe(false); // lunes
    expect(isMexicoCityWeekend(new Date("2026-09-08T15:00:00Z"))).toBe(false); // martes
  });
});
