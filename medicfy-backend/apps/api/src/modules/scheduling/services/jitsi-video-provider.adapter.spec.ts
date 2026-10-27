import { describe, expect, it } from "vitest";
import { JitsiVideoProviderAdapter } from "./jitsi-video-provider.adapter";

const APPOINTMENT_ID = "11111111-1111-4111-8111-111111111111";
const EXPIRES_AT = new Date("2026-11-01T18:00:00.000Z");

describe("JitsiVideoProviderAdapter", () => {
  it("siempre está configurado — no hay credenciales que leer", () => {
    expect(new JitsiVideoProviderAdapter().isConfigured()).toBe(true);
  });

  it("devuelve la sala pública de meet.jit.si con el nombre determinista de la cita, sin red", async () => {
    const room = await new JitsiVideoProviderAdapter().createRoom({ appointmentId: APPOINTMENT_ID, expiresAt: EXPIRES_AT });
    expect(room).toEqual({
      providerRef: `medicfy-${APPOINTMENT_ID}`,
      roomUrl: `https://meet.jit.si/medicfy-${APPOINTMENT_ID}`,
    });
  });
});
