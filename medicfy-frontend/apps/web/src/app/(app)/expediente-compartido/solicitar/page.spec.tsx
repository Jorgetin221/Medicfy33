import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { I18nProvider } from "@/lib/i18n/context";
import SolicitarExpedienteCompartidoPage from "./page";

const apiFetch = vi.fn();
// ErrorState (components/ui/states.tsx) importa ApiError del mismo
// módulo — hay que conservar el resto de las exportaciones reales y
// solo sustituir apiFetch, o `error instanceof ApiError` revienta
// contra un ApiError undefined.
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ accessToken: "tok", isLoading: false }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText("Nombre(s) del paciente"), { target: { value: "María José" } });
  fireEvent.change(screen.getByLabelText("Apellido paterno"), { target: { value: "Peña" } });
  // DateInput (ui/date-input.tsx) es un campo enmascarado ddmmaaaa, no
  // un <input type="date"> — mismo patrón que date-input.spec.tsx.
  fireEvent.change(screen.getByLabelText("Fecha de nacimiento"), { target: { value: "15031990" } });
  fireEvent.change(screen.getByLabelText("Teléfono del paciente"), { target: { value: "5512345678" } });
  fireEvent.change(screen.getByLabelText("Motivo de la solicitud"), {
    target: { value: "Valoración por dolor torácico y antecedentes" },
  });
}

describe("SolicitarExpedienteCompartidoPage", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("muestra el Resumen clínico siempre marcado y bloqueado", () => {
    render(<I18nProvider initialLocale="es"><SolicitarExpedienteCompartidoPage /></I18nProvider>);
    const summaryCheckbox = screen.getByLabelText("Resumen clínico (siempre incluido)") as HTMLInputElement;
    expect(summaryCheckbox.checked).toBe(true);
    expect(summaryCheckbox.disabled).toBe(true);
  });

  it("envía scope con SUMMARY incluido aunque no se marque ninguna otra casilla, y muestra la confirmación genérica", async () => {
    apiFetch.mockResolvedValue({ message: "generic" });
    render(<I18nProvider initialLocale="es"><SolicitarExpedienteCompartidoPage /></I18nProvider>);
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    const [path, options] = apiFetch.mock.calls[0] as [string, { body: { scope: string[] } }];
    expect(path).toBe("/record-share/requests");
    expect(options.body.scope).toEqual(["SUMMARY"]);

    expect(await screen.findByText("Solicitud enviada")).toBeInTheDocument();
  });

  it("agrega un alcance opcional al arreglo enviado cuando se marca", async () => {
    apiFetch.mockResolvedValue({ message: "generic" });
    render(<I18nProvider initialLocale="es"><SolicitarExpedienteCompartidoPage /></I18nProvider>);
    fillRequiredFields();
    fireEvent.click(screen.getByLabelText("Notas firmadas"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    const [, options] = apiFetch.mock.calls[0] as [string, { body: { scope: string[] } }];
    expect(options.body.scope).toEqual(expect.arrayContaining(["SUMMARY", "SIGNED_NOTES"]));
  });

  it("muestra un error del servidor sin romper el formulario (p. ej. límite diario alcanzado)", async () => {
    const { ApiError } = await import("@/lib/api-client");
    apiFetch.mockRejectedValue(new ApiError("RECORD_SHARE_REQUEST_LIMIT_REACHED", "Alcanzaste el límite de solicitudes de hoy.", 429));
    render(<I18nProvider initialLocale="es"><SolicitarExpedienteCompartidoPage /></I18nProvider>);
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    expect(await screen.findByText("Alcanzaste el límite de solicitudes de hoy.")).toBeInTheDocument();
  });
});
