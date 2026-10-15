import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n/context";
import { AtlasModal } from "./atlas-modal";

const apiFetch = vi.fn();
vi.mock("@/lib/api-client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const SESSION = {
  id: "sess-1",
  launchCode: "codigo-de-un-solo-uso",
  launchCodeExpiresAt: "2026-10-14T12:01:00Z",
  expiresAt: "2026-10-14T12:15:00Z",
  viewerUrl: "http://localhost:3300",
  mode: "clinician" as const,
};

function wrap(ui: ReactNode) {
  return <I18nProvider initialLocale="es">{ui}</I18nProvider>;
}

function renderModal(props: { open?: boolean; onClose?: () => void } = {}) {
  const onClose = props.onClose ?? vi.fn();
  const view = render(wrap(<AtlasModal open={props.open ?? true} onClose={onClose} patientId="p1" accessToken="tok" />));
  return { ...view, onClose };
}

describe("AtlasModal", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("es una ventana emergente accesible y muestra el estado de carga mientras pide la sesión", () => {
    apiFetch.mockReturnValue(new Promise(() => {}));
    renderModal();
    const dialog = screen.getByRole("dialog", { name: "Atlas Anatómico 3D BETA" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Abriendo el atlas…")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/records/patients/p1/atlas-sessions", { method: "POST", accessToken: "tok" });
  });

  it("explica que el atlas no está configurado sin ofrecer reintento", async () => {
    apiFetch.mockResolvedValue({ kind: "unavailable", reason: "NOT_CONFIGURED" });
    renderModal();
    expect(await screen.findByText("El atlas anatómico no está configurado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
  });

  it("ofrece reintentar cuando el atlas no responde", async () => {
    apiFetch.mockResolvedValueOnce({ kind: "unavailable", reason: "ATLAS_ERROR" }).mockReturnValue(new Promise(() => {}));
    renderModal();
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("monta el visor sin poner el launchCode en la URL y revoca la sesión al cerrar", async () => {
    apiFetch.mockImplementation(async (path: string) => (path.endsWith("/revoke") ? { revoked: true } : { kind: "ok", session: SESSION }));
    const { rerender } = renderModal();

    await waitFor(() => expect(screen.getByTestId("atlas-viewer").querySelector("iframe")).not.toBeNull());
    const iframe = screen.getByTestId("atlas-viewer").querySelector("iframe");
    if (!iframe) throw new Error("el visor no montó el iframe");
    expect(iframe.src).toBe("http://localhost:3300/?embed=1");
    expect(iframe.src).not.toContain(SESSION.launchCode);

    rerender(wrap(<AtlasModal open={false} onClose={vi.fn()} patientId="p1" accessToken="tok" />));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/records/patients/p1/atlas-sessions/sess-1/revoke", { method: "POST", accessToken: "tok" });
  });

  it("se cierra con Escape", () => {
    apiFetch.mockReturnValue(new Promise(() => {}));
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
