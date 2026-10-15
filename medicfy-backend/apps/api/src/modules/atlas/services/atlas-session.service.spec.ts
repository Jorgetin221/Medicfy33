import { describe, expect, it, vi } from "vitest";
import { ApiException } from "../../../common/api-exception";
import { AtlasSessionService } from "./atlas-session.service";
import { AtlasHttpError } from "./atlas-http.adapter";
import type { AtlasApiPort, AtlasRemoteSession } from "./atlas-api.port";

const PATIENT = "11111111-1111-4111-8111-111111111111";
const DOCTOR = "22222222-2222-4222-8222-222222222222";
const OTHER_DOCTOR = "33333333-3333-4333-8333-333333333333";

const remote: AtlasRemoteSession = {
  id: "sess-1",
  launchCode: "launch-code-one-use",
  launchCodeExpiresAt: "2026-10-14T12:01:00.000Z",
  expiresAt: "2026-10-14T12:15:00.000Z",
  mode: "clinician",
};

function fakePort(overrides: Partial<AtlasApiPort> = {}): AtlasApiPort {
  return {
    isConfigured: () => true,
    viewerUrl: () => "http://localhost:3300",
    createSession: vi.fn(async () => remote),
    revokeSession: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("AtlasSessionService", () => {
  it("se degrada a NOT_CONFIGURED sin llamar al atlas cuando faltan credenciales", async () => {
    const port = fakePort({ isConfigured: () => false });
    const outcome = await new AtlasSessionService(port).openSession(PATIENT, DOCTOR);
    expect(outcome).toEqual({ kind: "unavailable", reason: "NOT_CONFIGURED" });
    expect(port.createSession).not.toHaveBeenCalled();
  });

  it("envía solo el UUID del paciente y el id del médico, y devuelve la sesión con la URL del visor", async () => {
    const port = fakePort();
    const outcome = await new AtlasSessionService(port).openSession(PATIENT, DOCTOR);
    expect(port.createSession).toHaveBeenCalledWith({ externalPatientId: PATIENT, practitionerRef: DOCTOR });
    expect(outcome).toEqual({ kind: "ok", session: { ...remote, viewerUrl: "http://localhost:3300" } });
  });

  it("convierte un error del atlas en ATLAS_ERROR en vez de propagarlo", async () => {
    const port = fakePort({ createSession: vi.fn(async () => Promise.reject(new AtlasHttpError(502, "UPSTREAM"))) });
    const outcome = await new AtlasSessionService(port).openSession(PATIENT, DOCTOR);
    expect(outcome).toEqual({ kind: "unavailable", reason: "ATLAS_ERROR" });
  });

  it("revoca la sesión cuando la pide el mismo médico para el mismo paciente", async () => {
    const port = fakePort();
    const service = new AtlasSessionService(port);
    await service.openSession(PATIENT, DOCTOR);
    await service.revokeSession(remote.id, PATIENT, DOCTOR);
    expect(port.revokeSession).toHaveBeenCalledWith(remote.id);
  });

  it("rechaza con 404 revocar una sesión abierta por otro médico, sin tocar el atlas", async () => {
    const port = fakePort();
    const service = new AtlasSessionService(port);
    await service.openSession(PATIENT, DOCTOR);
    await expect(service.revokeSession(remote.id, PATIENT, OTHER_DOCTOR)).rejects.toBeInstanceOf(ApiException);
    expect(port.revokeSession).not.toHaveBeenCalled();
  });

  it("rechaza con 404 revocar una sesión desconocida", async () => {
    const service = new AtlasSessionService(fakePort());
    await expect(service.revokeSession("no-existe", PATIENT, DOCTOR)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
