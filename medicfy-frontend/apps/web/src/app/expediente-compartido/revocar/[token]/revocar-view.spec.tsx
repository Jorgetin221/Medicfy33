import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordShareRevocationInfo } from "@medicfy/contracts";
import { I18nProvider } from "@/lib/i18n/context";
import { RevocarExpedienteCompartidoView } from "./revocar-view";

const apiFetch = vi.fn();
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

const GRANT_ID = "4f7c1a2e-8b1d-4c3e-9a1f-2b3c4d5e6f70";
const INFO: RecordShareRevocationInfo = {
  activeGrants: [
    {
      grantId: GRANT_ID,
      requesterDisplayName: "Dra. Elena Cruz",
      requesterLicense: "1234567",
      requesterSpecialtyName: "Cardiología",
      scope: ["SUMMARY", "RESULTS"],
      expiresAt: "2026-12-01T12:00:00.000Z",
      isLinkGrant: true,
    },
  ],
};

function renderView() {
  return render(
    <I18nProvider initialLocale="es">
      <RevocarExpedienteCompartidoView token="tok-rev" />
    </I18nProvider>
  );
}

describe("RevocarExpedienteCompartidoView", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("muestra enlace inválido si el token no existe", async () => {
    apiFetch.mockRejectedValueOnce(new Error("404"));
    renderView();
    expect(await screen.findByText("Este enlace ya no es válido")).toBeInTheDocument();
  });

  it("muestra el estado vacío cuando no hay accesos vigentes", async () => {
    apiFetch.mockResolvedValueOnce({ activeGrants: [] });
    renderView();
    expect(await screen.findByText(/No hay accesos vigentes/)).toBeInTheDocument();
  });

  it("no deja revocar sin validar el código primero", async () => {
    apiFetch.mockResolvedValueOnce(INFO);
    renderView();
    await screen.findByText("Dra. Elena Cruz");
    expect(screen.queryByRole("button", { name: "Quitar acceso" })).not.toBeInTheDocument();
    expect(screen.getByText("Este enlace")).toBeInTheDocument();
  });

  it("OTP → confirmar → revoca el grant y recarga la lista", async () => {
    apiFetch.mockResolvedValueOnce(INFO);
    renderView();
    await screen.findByText("Dra. Elena Cruz");

    apiFetch.mockResolvedValueOnce({ sent: true });
    fireEvent.click(screen.getByRole("button", { name: "Enviarme un código para confirmar" }));
    fireEvent.change(await screen.findByLabelText("Código de 6 dígitos"), { target: { value: "123456" } });
    apiFetch.mockResolvedValueOnce({ verified: true });
    fireEvent.click(screen.getByRole("button", { name: "Validar código" }));

    fireEvent.click(await screen.findByRole("button", { name: "Quitar acceso" }));
    apiFetch.mockResolvedValueOnce({ revoked: true });
    apiFetch.mockResolvedValueOnce({ activeGrants: [] });
    fireEvent.click(screen.getByRole("button", { name: "Sí, quitar acceso" }));

    expect(await screen.findByText("Listo: Dra. Elena Cruz ya no puede ver tu expediente.")).toBeInTheDocument();
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/record-share/revoke/tok-rev/revoke", { method: "POST", body: { grantId: GRANT_ID } })
    );
  });
});
