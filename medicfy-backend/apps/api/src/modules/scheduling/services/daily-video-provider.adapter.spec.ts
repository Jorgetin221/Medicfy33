import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DailyHttpError, DailyVideoProviderAdapter } from "./daily-video-provider.adapter";

const ENV_KEYS = ["DAILY_API_KEY", "DAILY_API_BASE_URL"] as const;
const APPOINTMENT_ID = "11111111-1111-4111-8111-111111111111";
const EXPIRES_AT = new Date("2026-11-01T18:00:00.000Z");

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type FetchCall = Parameters<typeof fetch>;

function callAt(http: { mock: { calls: FetchCall[] } }, index: number): { url: FetchCall[0]; init: RequestInit } {
  const call = http.mock.calls[index];
  if (!call) throw new Error(`fetch no recibió la llamada #${index}`);
  return { url: call[0], init: call[1] ?? {} };
}

describe("DailyVideoProviderAdapter", () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) original[k] = process.env[k];
    process.env.DAILY_API_KEY = "daily-secret";
    process.env.DAILY_API_BASE_URL = "http://daily.test/v1/";
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      const value = original[k];
      if (value === undefined) Reflect.deleteProperty(process.env, k);
      else process.env[k] = value;
    }
  });

  it("no está configurado sin DAILY_API_KEY", () => {
    delete process.env.DAILY_API_KEY;
    expect(new DailyVideoProviderAdapter(vi.fn()).isConfigured()).toBe(false);
  });

  it("crea la sala con grabación bloqueada y el nombre determinista de la cita", async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValueOnce(json(200, { name: `medicfy-${APPOINTMENT_ID}`, url: "https://medicfy.daily.co/medicfy-x" }));

    const room = await new DailyVideoProviderAdapter(http).createRoom({ appointmentId: APPOINTMENT_ID, expiresAt: EXPIRES_AT });

    expect(room).toEqual({ providerRef: `medicfy-${APPOINTMENT_ID}`, roomUrl: "https://medicfy.daily.co/medicfy-x" });
    const call = callAt(http, 0);
    expect(call.url).toBe("http://daily.test/v1/rooms");
    expect((call.init.headers as Record<string, string>).Authorization).toBe("Bearer daily-secret");
    const body = JSON.parse(call.init.body as string);
    expect(body).toMatchObject({ name: `medicfy-${APPOINTMENT_ID}`, properties: { enable_recording: false, exp: Math.floor(EXPIRES_AT.getTime() / 1000) } });
  });

  it("recupera la sala existente si Daily.co responde que ya existe (idempotente)", async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(400, { error: "room-already-exists" }))
      .mockResolvedValueOnce(json(200, { name: `medicfy-${APPOINTMENT_ID}`, url: "https://medicfy.daily.co/medicfy-x" }));

    const room = await new DailyVideoProviderAdapter(http).createRoom({ appointmentId: APPOINTMENT_ID, expiresAt: EXPIRES_AT });

    expect(room.roomUrl).toBe("https://medicfy.daily.co/medicfy-x");
    const getCall = callAt(http, 1);
    expect(getCall.url).toBe(`http://daily.test/v1/rooms/medicfy-${APPOINTMENT_ID}`);
    expect(getCall.init.method).toBe("GET");
  });

  it("traduce una respuesta de error en DailyHttpError sin copiar el cuerpo de Daily.co", async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValueOnce(json(401, { error: "auth-error", info: "detalle interno" }));
    const error = await new DailyVideoProviderAdapter(http)
      .createRoom({ appointmentId: APPOINTMENT_ID, expiresAt: EXPIRES_AT })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DailyHttpError);
    expect(error).toMatchObject({ status: 401, dailyErrorCode: "auth-error" });
    expect((error as Error).message).not.toContain("detalle interno");
  });
});
