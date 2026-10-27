import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n/context";
import { TeleconsultaScreen } from "./teleconsulta-screen";

const apiFetch = vi.fn();
vi.mock("@/lib/api-client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

let online = true;
vi.mock("@/lib/use-online-status", () => ({ useOnlineStatus: () => online }));

function wrap(ui: ReactNode) {
  return <I18nProvider initialLocale="es">{ui}</I18nProvider>;
}

function renderScreen() {
  return render(wrap(<TeleconsultaScreen appointmentId="apt-3" accessToken="tok" />));
}

describe("TeleconsultaScreen", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    push.mockReset();
    online = true;
  });

  it("pide el enlace al backend al montar y muestra el estado de carga", () => {
    apiFetch.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByText("Conectando con la videollamada…")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/appointments/apt-3/video-room", { method: "POST", accessToken: "tok" });
  });

  it("monta el iframe del proveedor cuando el enlace está listo", async () => {
    apiFetch.mockResolvedValue({ kind: "ok", room: { url: "https://medicfy.daily.co/medicfy-apt-3" } });
    renderScreen();
    const iframe = await screen.findByTestId("teleconsulta-iframe");
    expect(iframe).toHaveAttribute("src", "https://medicfy.daily.co/medicfy-apt-3");
  });

  it("explica que la teleconsulta no está configurada, sin ofrecer reintento", async () => {
    apiFetch.mockResolvedValue({ kind: "unavailable", reason: "NOT_CONFIGURED" });
    renderScreen();
    expect(await screen.findByText("Teleconsulta no disponible")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
  });

  it("ofrece reintentar cuando el proveedor falla", async () => {
    apiFetch.mockResolvedValueOnce({ kind: "unavailable", reason: "PROVIDER_ERROR" }).mockReturnValue(new Promise(() => {}));
    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("muestra el estado sin conexión sin llamar al backend", () => {
    online = false;
    renderScreen();
    expect(screen.getByText("Sin conexión a internet")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('"Salir" regresa a la pantalla de consulta', async () => {
    apiFetch.mockReturnValue(new Promise(() => {}));
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Salir" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/consulta/apt-3"));
  });
});
