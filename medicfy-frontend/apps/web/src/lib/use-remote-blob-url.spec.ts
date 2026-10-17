import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRemoteBlobUrl } from "./use-remote-blob-url";

const apiFetchBlob = vi.fn();
vi.mock("@/lib/api-client", () => ({ apiFetchBlob: (...args: unknown[]) => apiFetchBlob(...args) }));

describe("useRemoteBlobUrl", () => {
  let nextId = 0;
  const revoked: string[] = [];

  beforeEach(() => {
    nextId = 0;
    revoked.length = 0;
    URL.createObjectURL = vi.fn(() => `blob:${++nextId}`);
    URL.revokeObjectURL = vi.fn((url: string) => {
      revoked.push(url);
    });
  });

  afterEach(() => {
    apiFetchBlob.mockReset();
  });

  it("descarga, muestra y libera cada URL al reemplazarla y al desmontar", async () => {
    apiFetchBlob.mockResolvedValue(new Blob(["logo"]));
    const { result, unmount } = renderHook(() => useRemoteBlobUrl("/logo", "tok"));
    await waitFor(() => expect(result.current.url).toBe("blob:1"));
    expect(apiFetchBlob).toHaveBeenCalledWith("/logo", { accessToken: "tok" });

    act(() => result.current.show(new Blob(["nuevo"])));
    expect(result.current.url).toBe("blob:2");
    expect(revoked).toEqual(["blob:1"]);

    unmount();
    expect(revoked).toEqual(["blob:1", "blob:2"]);
  });

  it("sin path no pide nada, y un fallo de red deja la vista previa vacía sin lanzar", async () => {
    renderHook(() => useRemoteBlobUrl(null, "tok"));
    expect(apiFetchBlob).not.toHaveBeenCalled();

    apiFetchBlob.mockRejectedValue(new Error("sin red"));
    const { result } = renderHook(() => useRemoteBlobUrl("/logo", "tok"));
    await waitFor(() => expect(apiFetchBlob).toHaveBeenCalled());
    expect(result.current.url).toBeNull();
  });
});
