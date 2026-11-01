import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordShareCustodianGrant } from "@medicfy/contracts";
import { I18nProvider } from "@/lib/i18n/context";
import { TabCompartido } from "./tab-compartido";

const apiFetch = vi.fn();
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

const GRANT: RecordShareCustodianGrant = {
  id: "4f7c1a2e-8b1d-4c3e-9a1f-2b3c4d5e6f70",
  requesterDisplayName: "Dra. Elena Cruz",
  requesterLicense: "1234567",
  scope: ["SUMMARY", "RESULTS"],
  status: "ACTIVE",
  startsAt: "2026-10-20T12:00:00.000Z",
  expiresAt: "2026-11-19T12:00:00.000Z",
  revokedAt: null,
  views: [{ viewedAt: "2026-10-25T15:00:00.000Z" }],
  abuseReported: false,
};

function renderTab() {
  return render(
    <I18nProvider initialLocale="es">
      <TabCompartido patientId="pat-1" accessToken="tok" />
    </I18nProvider>
  );
}

describe("TabCompartido", () => {
  beforeEach(() => apiFetch.mockReset());

  it("estado vacío", async () => {
    apiFetch.mockResolvedValueOnce([]);
    renderTab();
    expect(await screen.findByText("Este paciente no ha compartido su expediente con otros médicos.")).toBeInTheDocument();
  });

  it("estado de error con reintento", async () => {
    apiFetch.mockRejectedValueOnce(new Error("boom"));
    renderTab();
    expect(await screen.findByRole("button", { name: /reintentar/i })).toBeInTheDocument();
  });

  it("muestra el acceso con estado en texto (no solo color) y sus consultas; no ofrece revocar", async () => {
    apiFetch.mockResolvedValueOnce([GRANT]);
    renderTab();
    expect(await screen.findByText("Dra. Elena Cruz")).toBeInTheDocument();
    expect(screen.getByText("Vigente")).toBeInTheDocument();
    expect(screen.getByText(/1 consulta\(s\)/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /revocar|quitar acceso/i })).not.toBeInTheDocument();
  });

  it("reportar exige motivo de 15+ caracteres y envía el reporte", async () => {
    apiFetch.mockResolvedValueOnce([GRANT]);
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Reportar uso indebido" }));
    const send = screen.getByRole("button", { name: "Enviar reporte" });
    fireEvent.change(screen.getByLabelText(/Describe qué observaste/), { target: { value: "corto" } });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Describe qué observaste/), { target: { value: "Consultas repetidas sin justificación clínica" } });
    apiFetch.mockResolvedValueOnce({ reported: true });
    apiFetch.mockResolvedValueOnce([{ ...GRANT, abuseReported: true }]);
    fireEvent.click(send);
    expect(await screen.findByText("Reporte enviado a administración.")).toBeInTheDocument();
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(`/record-share/patients/pat-1/grants/${GRANT.id}/report-abuse`, {
        method: "POST",
        accessToken: "tok",
        body: { reason: "Consultas repetidas sin justificación clínica" },
      })
    );
  });
});
