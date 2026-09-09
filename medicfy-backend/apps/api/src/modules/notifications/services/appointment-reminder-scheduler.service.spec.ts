import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// bullmq real exige un Redis alcanzable incluso solo para construir
// Queue/Worker (conexión ioredis no perezosa por defecto) — no hay
// Redis real en ningún entorno donde se construyó este servicio (ver
// comentario en appointment-reminder-scheduler.service.ts), así que
// lo único verificable aquí sin red es: (a) la degradación honesta
// cuando falta REDIS_URL, y (b) la lógica pura de cuándo programar,
// omitir y cancelar — mockeando bullmq en vez de mockear nuestro
// propio código.
const addMock = vi.fn().mockResolvedValue(undefined);
const removeMock = vi.fn().mockResolvedValue(undefined);
const closeMock = vi.fn().mockResolvedValue(undefined);
let queueConstructions = 0;

vi.mock("bullmq", () => {
  return {
    Queue: vi.fn().mockImplementation(() => {
      queueConstructions += 1;
      return { add: addMock, remove: removeMock, close: closeMock };
    }),
    Worker: vi.fn().mockImplementation(() => ({ on: vi.fn(), close: closeMock })),
  };
});

import { AppointmentReminderSchedulerService } from "./appointment-reminder-scheduler.service";

function buildService(): AppointmentReminderSchedulerService {
  const fakePrisma = {} as never;
  const fakeNotifications = {} as never;
  const fakeLinks = {} as never;
  return new AppointmentReminderSchedulerService(fakePrisma, fakeNotifications, fakeLinks);
}

describe("AppointmentReminderSchedulerService", () => {
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    addMock.mockClear();
    removeMock.mockClear();
    queueConstructions = 0;
  });

  afterEach(() => {
    if (originalRedisUrl !== undefined) process.env.REDIS_URL = originalRedisUrl;
    else delete process.env.REDIS_URL;
  });

  it("sin REDIS_URL no construye una cola ni intenta encolar nada", async () => {
    delete process.env.REDIS_URL;
    const service = buildService();
    await service.scheduleAppointmentReminders({ id: "appt-1", startsAt: new Date(Date.now() + 30 * 60 * 60 * 1000) });
    expect(queueConstructions).toBe(0);
    expect(addMock).not.toHaveBeenCalled();
  });

  it("programa 24h y 2h con jobId determinístico cuando ambos caen en el futuro", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    const service = buildService();
    await service.scheduleAppointmentReminders({ id: "appt-2", startsAt: new Date(Date.now() + 30 * 60 * 60 * 1000) });

    expect(addMock).toHaveBeenCalledTimes(2);
    const jobIds = addMock.mock.calls.map((call) => (call[2] as { jobId: string }).jobId);
    expect(jobIds).toEqual(["appointment-reminder-24h:appt-2", "appointment-reminder-2h:appt-2"]);
    for (const call of addMock.mock.calls) {
      const opts = call[2] as { delay: number };
      expect(opts.delay).toBeGreaterThan(0);
    }
  });

  it("omite (no encola) el recordatorio cuyo horario de disparo ya pasó, sin lanzar ni disparar de inmediato", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    const service = buildService();
    // Cita en 1h: tanto "24h antes" como "2h antes" ya quedaron en el
    // pasado — ninguno de los dos recordatorios tiene sentido.
    await service.scheduleAppointmentReminders({ id: "appt-3", startsAt: new Date(Date.now() + 60 * 60 * 1000) });
    expect(addMock).not.toHaveBeenCalled();
  });

  it("cancela ambos jobs (24h y 2h) por su jobId determinístico", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    const service = buildService();
    await service.cancelAppointmentReminders("appt-4");
    expect(removeMock).toHaveBeenCalledWith("appointment-reminder-24h:appt-4");
    expect(removeMock).toHaveBeenCalledWith("appointment-reminder-2h:appt-4");
  });

  it("cancelar sin REDIS_URL no falla (no-op)", async () => {
    delete process.env.REDIS_URL;
    const service = buildService();
    await expect(service.cancelAppointmentReminders("appt-5")).resolves.toBeUndefined();
    expect(removeMock).not.toHaveBeenCalled();
  });
});
