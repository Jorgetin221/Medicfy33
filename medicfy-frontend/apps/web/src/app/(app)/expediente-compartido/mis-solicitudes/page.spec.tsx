import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ShareRequestSummary } from "@medicfy/contracts";
import { I18nProvider } from "@/lib/i18n/context";
import MisSolicitudesExpedienteCompartidoPage from "./page";

const apiFetch = vi.fn();
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ accessToken: "tok", isLoading: false }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const PENDING: ShareRequestSummary = {
  id: "req-1",
  status: "PENDING_PATIENT",
  requestedScope: ["SUMMARY"],
  requestedDurationDays: 30,
  reason: "Valoración por dolor torácico",
  createdAt: "2026-10-30T10:00:00Z",
  expiresAt: "2026-11-02T10:00:00Z",
};

function renderPage() {
  return render(
    <I18nProvider initialLocale="es">
      <MisSolicitudesExpedienteCompartidoPage />
    </I18nProvider>
  );
}

describe("MisSolicitudesExpedienteCompartidoPage", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("muestra el estado vacío con una salida a 'Solicitar expediente'", async () => {
    apiFetch.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("Todavía no has solicitado ningún expediente compartido.")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Solicitar expediente" }).length).toBeGreaterThan(0);
  });

  // RE5 (00-DESCUBRIMIENTO.md / 02-solicitud-del-medico.md): DENIED y
  // EXPIRED_UNANSWERED se ven IGUAL para el solicitante.
  it("muestra DENIED y EXPIRED_UNANSWERED con el mismo texto ('No autorizada')", async () => {
    apiFetch.mockResolvedValue([
      { ...PENDING, id: "req-denied", status: "DENIED" },
      { ...PENDING, id: "req-expired", status: "EXPIRED_UNANSWERED" },
    ]);
    renderPage();
    const noAutorizada = await screen.findAllByText("No autorizada");
    expect(noAutorizada).toHaveLength(2);
  });

  it("cancela una solicitud PENDING_PATIENT tras confirmar, y recarga la lista", async () => {
    apiFetch.mockResolvedValueOnce([PENDING]);
    renderPage();
    expect(await screen.findByText("Valoración por dolor torácico")).toBeInTheDocument();

    apiFetch.mockResolvedValueOnce({ cancelled: true });
    apiFetch.mockResolvedValueOnce([{ ...PENDING, status: "CANCELLED_BY_REQUESTER" }]);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar solicitud" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/record-share/requests/req-1/cancel", { method: "POST", accessToken: "tok" }));
    expect(await screen.findByText("Cancelada")).toBeInTheDocument();
  });

  it("no muestra el botón de cancelar para una solicitud que ya no está pendiente", async () => {
    apiFetch.mockResolvedValue([{ ...PENDING, status: "APPROVED" }]);
    renderPage();
    await screen.findByText("Autorizada");
    expect(screen.queryByRole("button", { name: "Cancelar solicitud" })).not.toBeInTheDocument();
  });
});
