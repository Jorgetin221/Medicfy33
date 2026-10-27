import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n/context";
import { TeleconsultaPanel } from "./teleconsulta-panel";

const apiFetch = vi.fn();
vi.mock("@/lib/api-client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

let online = true;
vi.mock("@/lib/use-online-status", () => ({ useOnlineStatus: () => online }));

function wrap(ui: ReactNode) {
  return <I18nProvider initialLocale="es">{ui}</I18nProvider>;
}

describe("TeleconsultaPanel", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    online = true;
  });

  it("no muestra nada mientras la consulta no está lista (visible=false)", () => {
    render(wrap(<TeleconsultaPanel visible={false} appointmentId="apt-1" accessToken="tok" />));
    expect(screen.queryByRole("button", { name: "Iniciar teleconsulta" })).not.toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("no pide el enlace hasta que el médico lo pide, y nunca navega — carga el video en el mismo lugar", async () => {
    apiFetch.mockResolvedValue({ kind: "ok", room: { url: "https://medicfy.daily.co/medicfy-apt-3" } });
    render(wrap(<TeleconsultaPanel visible={true} appointmentId="apt-3" accessToken="tok" />));
    expect(apiFetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Iniciar teleconsulta" }));
    expect(apiFetch).toHaveBeenCalledWith("/appointments/apt-3/video-room", { method: "POST", accessToken: "tok" });

    const iframe = await screen.findByTestId("teleconsulta-iframe");
    expect(iframe).toHaveAttribute("src", "https://medicfy.daily.co/medicfy-apt-3");
    // El botón ahora oculta el panel en vez de abrir algo nuevo.
    expect(screen.getByRole("button", { name: "Ocultar video" })).toBeInTheDocument();
  });

  it("vuelve a ocultar el panel sin perder la cita (el médico puede reabrirlo)", async () => {
    apiFetch.mockResolvedValue({ kind: "ok", room: { url: "https://medicfy.daily.co/medicfy-apt-3" } });
    render(wrap(<TeleconsultaPanel visible={true} appointmentId="apt-3" accessToken="tok" />));
    fireEvent.click(screen.getByRole("button", { name: "Iniciar teleconsulta" }));
    await screen.findByTestId("teleconsulta-iframe");

    fireEvent.click(screen.getByRole("button", { name: "Ocultar video" }));
    expect(screen.queryByTestId("teleconsulta-iframe")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Iniciar teleconsulta" })).toBeInTheDocument();
  });

  it("explica que la teleconsulta no está configurada, sin ofrecer reintento", async () => {
    apiFetch.mockResolvedValue({ kind: "unavailable", reason: "NOT_CONFIGURED" });
    render(wrap(<TeleconsultaPanel visible={true} appointmentId="apt-3" accessToken="tok" />));
    fireEvent.click(screen.getByRole("button", { name: "Iniciar teleconsulta" }));
    expect(await screen.findByText("Teleconsulta no disponible")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
  });

  it("ofrece reintentar cuando el proveedor falla", async () => {
    apiFetch.mockResolvedValueOnce({ kind: "unavailable", reason: "PROVIDER_ERROR" }).mockReturnValue(new Promise(() => {}));
    render(wrap(<TeleconsultaPanel visible={true} appointmentId="apt-3" accessToken="tok" />));
    fireEvent.click(screen.getByRole("button", { name: "Iniciar teleconsulta" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("muestra el estado sin conexión sin llamar al backend", () => {
    online = false;
    render(wrap(<TeleconsultaPanel visible={true} appointmentId="apt-3" accessToken="tok" />));
    fireEvent.click(screen.getByRole("button", { name: "Iniciar teleconsulta" }));
    expect(screen.getByText("Sin conexión a internet")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
