import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AtlasHttpAdapter, AtlasHttpError } from "./atlas-http.adapter";

const ENV_KEYS = ["ATLAS_API_URL", "ATLAS_VIEWER_URL", "ATLAS_CLIENT_ID", "ATLAS_CLIENT_SECRET", "WEB_ORIGIN"] as const;
const PATIENT = "11111111-1111-4111-8111-111111111111";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type FetchCall = Parameters<typeof fetch>;

function callAt(http: { mock: { calls: FetchCall[] } }, index: number): { url: FetchCall[0]; init: RequestInit } {
  const call = http.mock.calls[index];
  if (!call) throw new Error(`fetch no recibió la llamada #${index}`);
  return { url: call[0], init: call[1] ?? {} };
}

describe("AtlasHttpAdapter", () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) original[k] = process.env[k];
    process.env.ATLAS_API_URL = "http://atlas.test/";
    process.env.ATLAS_VIEWER_URL = "http://viewer.test";
    process.env.ATLAS_CLIENT_ID = "medicfy";
    process.env.ATLAS_CLIENT_SECRET = "s3cret";
    process.env.WEB_ORIGIN = "http://localhost:3000";
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      const value = original[k];
      if (value === undefined) Reflect.deleteProperty(process.env, k);
      else process.env[k] = value;
    }
  });

  it("no está configurado si falta cualquier credencial", () => {
    delete process.env.ATLAS_CLIENT_SECRET;
    expect(new AtlasHttpAdapter(vi.fn()).isConfigured()).toBe(false);
  });

  it("obtiene token, vincula al paciente por UUID y pide la sesión para el origen de Medicfy", async () => {
    const http = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json(200, { access_token: "tok", expires_in: 300 }))
      .mockResolvedValueOnce(json(201, { id: "link-1" }))
      .mockResolvedValueOnce(json(201, { id: "sess-1", launchCode: "lc", launchCodeExpiresAt: "x", expiresAt: "y", mode: "clinician" }));

    const session = await new AtlasHttpAdapter(http).createSession({ externalPatientId: PATIENT, practitionerRef: "doc-1" });

    expect(session.launchCode).toBe("lc");
    const token = callAt(http, 0);
    expect(token.url).toBe("http://atlas.test/api/v1/oauth/token");
    expect(JSON.parse(token.init.body as string)).toMatchObject({ grant_type: "client_credentials", client_id: "medicfy" });

    const link = callAt(http, 1);
    expect(link.url).toBe("http://atlas.test/api/v1/patient-links");
    expect(JSON.parse(link.init.body as string)).toEqual({ externalSystem: "medicfy", externalPatientId: PATIENT });

    const sess = callAt(http, 2);
    expect(sess.url).toBe("http://atlas.test/api/v1/viewer-sessions");
    expect((sess.init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(sess.init.body as string)).toEqual({
      patientId: "link-1",
      practitionerRef: "doc-1",
      mode: "clinician",
      permissions: ["findings:read", "annotations:read", "annotations:write"],
      origin: "http://localhost:3000",
    });
  });

  it("reutiliza el token mientras no esté por vencer", async () => {
    const http = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json(200, { access_token: "tok", expires_in: 300 }))
      .mockImplementation(async () => json(200, { revoked: true }));
    const adapter = new AtlasHttpAdapter(http);
    await adapter.revokeSession("a");
    await adapter.revokeSession("b");
    expect(http.mock.calls.filter(([url]) => String(url).endsWith("/oauth/token"))).toHaveLength(1);
    expect(callAt(http, 2).url).toBe("http://atlas.test/api/v1/viewer-sessions/b/revoke");
  });

  it("traduce una respuesta de error en AtlasHttpError sin copiar el mensaje del atlas", async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValueOnce(json(401, { error: { code: "AUTH_INVALID_CREDENTIALS", message: "detalle interno", request_id: "r-1" } }));
    const error = await new AtlasHttpAdapter(http).revokeSession("a").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AtlasHttpError);
    expect(error).toMatchObject({ status: 401, code: "AUTH_INVALID_CREDENTIALS", requestId: "r-1" });
    expect((error as Error).message).not.toContain("detalle interno");
  });
});
