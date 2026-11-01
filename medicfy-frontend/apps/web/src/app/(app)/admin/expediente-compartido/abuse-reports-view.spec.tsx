import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordShareAbuseReport } from "@medicfy/contracts";
import { I18nProvider } from "@/lib/i18n/context";
import { AbuseReportsView } from "./abuse-reports-view";

const apiFetch = vi.fn();
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

const REPORT: RecordShareAbuseReport = {
  auditId: "11111111-1111-4111-8111-111111111111",
  grantId: "22222222-2222-4222-8222-222222222222",
  reportedAt: "2026-10-30T10:00:00.000Z",
  reason: "Consultas repetidas sin justificación clínica",
  requesterDisplayName: "Dra. Elena Cruz",
  requesterLicense: "1234567",
  custodianDisplayName: "Dr. Roberto Díaz",
  grantStatus: "ACTIVE",
  grantExpiresAt: "2026-11-19T12:00:00.000Z",
};

function renderView() {
  return render(
    <I18nProvider initialLocale="es">
      <AbuseReportsView accessToken="admin-tok" />
    </I18nProvider>
  );
}

describe("AbuseReportsView", () => {
  beforeEach(() => apiFetch.mockReset());

  it("estado vacío", async () => {
    apiFetch.mockResolvedValueOnce([]);
    renderView();
    expect(await screen.findByText("No hay reportes de uso indebido.")).toBeInTheDocument();
  });

  it("muestra solo metadatos y suspende con motivo", async () => {
    apiFetch.mockResolvedValueOnce([REPORT]);
    renderView();
    expect(await screen.findByText(/Dra. Elena Cruz/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Suspender acceso" }));
    fireEvent.change(screen.getByLabelText(/Motivo de la suspensión/), { target: { value: "Suspensión preventiva por reporte" } });
    apiFetch.mockResolvedValueOnce({ suspended: true });
    apiFetch.mockResolvedValueOnce([{ ...REPORT, grantStatus: "SUSPENDED_BY_ADMIN" }]);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar suspensión" }));
    expect(await screen.findByText("Acceso suspendido.")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith(`/admin/record-share/grants/${REPORT.grantId}/suspend`, {
      method: "POST",
      accessToken: "admin-tok",
      body: { reason: "Suspensión preventiva por reporte" },
    });
    expect(await screen.findByText(/Suspendido por administración/)).toBeInTheDocument();
  });
});
