import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, apiFetchBlob, apiUpload, ApiError, setAuthRefreshHandlers } from "./api-client";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const EXPIRED = json(401, { error: { code: "AUTH_INVALID_CREDENTIALS", message: "Token vencido" } });

function authHeader(call: Parameters<typeof fetch>): string | undefined {
  return ((call[1] as RequestInit).headers as Record<string, string>).Authorization;
}

describe("api-client", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const onTokenRefreshed = vi.fn();
  const onSessionExpired = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    setAuthRefreshHandlers({ onTokenRefreshed, onSessionExpired });
  });

  function call(index: number): Parameters<typeof fetch> {
    const found = fetchMock.mock.calls[index];
    if (!found) throw new Error(`fetch no recibió la llamada #${index}`);
    return found;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    onTokenRefreshed.mockReset();
    onSessionExpired.mockReset();
  });

  it("apiFetch devuelve el JSON y manda el token y el cuerpo", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    await expect(apiFetch("/x", { method: "POST", body: { a: 1 }, accessToken: "t1" })).resolves.toEqual({ ok: true });
    const [url, init] = call(0);
    expect(url).toMatch(/\/x$/);
    expect(init?.body).toBe(JSON.stringify({ a: 1 }));
    expect(authHeader(call(0))).toBe("Bearer t1");
  });

  it("con token vencido renueva una vez y reintenta con el token nuevo", async () => {
    fetchMock
      .mockResolvedValueOnce(EXPIRED.clone())
      .mockResolvedValueOnce(json(200, { accessToken: "t2" }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    await expect(apiFetch("/x", { accessToken: "t1" })).resolves.toEqual({ ok: true });
    expect(call(1)[0]).toMatch(/\/auth\/refresh$/);
    expect(authHeader(call(2))).toBe("Bearer t2");
    expect(onTokenRefreshed).toHaveBeenCalledWith("t2");
  });

  it("si la sesión ya no se puede renovar avisa y lanza el error del servidor", async () => {
    fetchMock.mockResolvedValueOnce(EXPIRED.clone()).mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(apiFetch("/x", { accessToken: "t1" })).rejects.toMatchObject({ code: "AUTH_INVALID_CREDENTIALS", status: 401 });
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it("sin red lanza NETWORK_ERROR (distinto de un error HTTP)", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const error = await apiFetch("/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "NETWORK_ERROR", status: 0 });
  });

  it("apiUpload usa el mismo reintento y no fija Content-Type (multipart)", async () => {
    fetchMock
      .mockResolvedValueOnce(EXPIRED.clone())
      .mockResolvedValueOnce(json(200, { accessToken: "t2" }))
      .mockResolvedValueOnce(json(201, { id: "f1" }));
    await expect(apiUpload("/up", new File(["x"], "logo.png"), { accessToken: "t1" })).resolves.toEqual({ id: "f1" });
    const init = call(2)[1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("apiFetchBlob: 404 es null y cualquier 401 con token se reintenta", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(apiFetchBlob("/f", { accessToken: "t1" })).resolves.toBeNull();

    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(json(200, { accessToken: "t2" }))
      .mockResolvedValueOnce(new Response("bytes", { status: 200 }));
    await expect(apiFetchBlob("/f", { accessToken: "t1" })).resolves.not.toBeNull();
    expect(authHeader(call(3))).toBe("Bearer t2");
  });
});
