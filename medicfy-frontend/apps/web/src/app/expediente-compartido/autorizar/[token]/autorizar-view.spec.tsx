import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { RecordShareAuthorizationInfo } from "@medicfy/contracts";
import { I18nProvider } from "@/lib/i18n/context";
import { AutorizarExpedienteCompartidoView } from "./autorizar-view";

const apiFetch = vi.fn();
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

const INFO: RecordShareAuthorizationInfo = {
  requesterDisplayName: "Dra. Elena Cruz",
  requesterLicense: "1234567",
  requesterSpecialtyName: "Cardiología",
  reason: "Valoración por dolor torácico y antecedentes cardiovasculares",
  requestedScope: ["SUMMARY", "SIGNED_NOTES"],
  requestedDurationDays: 30,
  consentTextVersion: "v1-2026-11-02",
  consentOptions: [7, 30].map((durationDays) => ({
    durationDays,
    text: "Autorizar acceso a tu expediente\n\nTexto de consentimiento de prueba.",
    acknowledgement: "Entiendo y autorizo el acceso.",
    sha256: "a".repeat(64),
  })),
};

function renderView() {
  return render(
    <I18nProvider initialLocale="es">
      <AutorizarExpedienteCompartidoView token="tok-123" />
    </I18nProvider>
  );
}

async function reachDecisionStep() {
  apiFetch.mockResolvedValueOnce(INFO); // GET info
  renderView();
  await screen.findByText("Dra. Elena Cruz");

  apiFetch.mockResolvedValueOnce({ sent: true }); // POST otp
  fireEvent.click(screen.getByRole("button", { name: "Enviarme el código" }));
  await screen.findByLabelText("Código de 6 dígitos");

  fireEvent.change(screen.getByLabelText("Código de 6 dígitos"), { target: { value: "123456" } });
  apiFetch.mockResolvedValueOnce({ verified: true }); // POST otp/verify
  fireEvent.click(screen.getByRole("button", { name: "Validar código" }));
  await screen.findByText("¿Qué quieres compartir?");
}

describe("AutorizarExpedienteCompartidoView", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("muestra el enlace inválido cuando la solicitud no existe o venció", async () => {
    apiFetch.mockRejectedValueOnce(new Error("404"));
    renderView();
    expect(await screen.findByText("Este enlace ya no es válido")).toBeInTheDocument();
  });

  it("muestra quién solicita, el motivo y el alcance pedido sin dato del paciente", async () => {
    apiFetch.mockResolvedValueOnce(INFO);
    renderView();
    expect(await screen.findByText("Dra. Elena Cruz", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(INFO.reason, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/Resumen clínico.*Notas firmadas/)).toBeInTheDocument();
  });

  it("llega al formulario de decisión tras pedir y validar el código", async () => {
    await reachDecisionStep();
    // "SUMMARY" siempre bloqueado y marcado; el resto del alcance pedido viene pre-marcado (el paciente REDUCE, no agrega).
    expect((screen.getByLabelText("Notas firmadas") as HTMLInputElement).checked).toBe(true);
  });

  it("al aprobar, nunca envía un alcance ni una duración mayores a lo solicitado, y las sensibles van vacías por defecto", async () => {
    await reachDecisionStep();
    // Reduce el alcance (quita "Notas firmadas") y la duración (30 -> 7).
    fireEvent.click(screen.getByLabelText("Notas firmadas"));
    fireEvent.change(screen.getByLabelText("Por cuánto tiempo"), { target: { value: "7" } });

    apiFetch.mockResolvedValueOnce({ status: "APPROVED" });
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/record-share/authorize/tok-123/decide", expect.objectContaining({ method: "POST" })));
    const [, options] = apiFetch.mock.calls.at(-1) as [string, { body: Record<string, unknown> }];
    expect(options.body).toEqual({
      decision: "APPROVED",
      approvedScope: ["SUMMARY"],
      includedSensitiveCategories: [],
      pregnancyExcluded: false,
      durationDays: 7,
    });
    expect(await screen.findByText("Autorización enviada")).toBeInTheDocument();
  });

  it("marcar 'excluir embarazo' muestra la advertencia y lo manda como pregnancyExcluded: true", async () => {
    await reachDecisionStep();
    fireEvent.click(screen.getByLabelText("Incluir embarazo activo"));
    expect(await screen.findByText(/afectar la seguridad de los medicamentos/)).toBeInTheDocument();

    apiFetch.mockResolvedValueOnce({ status: "APPROVED" });
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(4));
    const [, options] = apiFetch.mock.calls.at(-1) as [string, { body: Record<string, unknown> }];
    expect(options.body).toMatchObject({ pregnancyExcluded: true });
  });

  it("rechazar no manda alcance ni duración", async () => {
    await reachDecisionStep();
    apiFetch.mockResolvedValueOnce({ status: "DENIED" });
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(4));
    const [, options] = apiFetch.mock.calls.at(-1) as [string, { body: Record<string, unknown> }];
    expect(options.body).toEqual({ decision: "DENIED" });
    expect(await screen.findByText("Solicitud rechazada")).toBeInTheDocument();
  });
});
