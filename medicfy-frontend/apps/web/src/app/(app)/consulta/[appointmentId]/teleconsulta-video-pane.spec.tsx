import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n/context";
import { TeleconsultaVideoPane } from "./teleconsulta-video-pane";

const apiFetch = vi.fn();
vi.mock("@/lib/api-client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

let online = true;
vi.mock("@/lib/use-online-status", () => ({ useOnlineStatus: () => online }));

function wrap(ui: ReactNode) {
  return <I18nProvider initialLocale="es">{ui}</I18nProvider>;
}

describe("TeleconsultaVideoPane", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    online = true;
  });

  it("pide el enlace al montar y muestra el iframe del proveedor al llegar", async () => {
    apiFetch.mockResolvedValue({ kind: "ok", room: { url: "https://medicfy.daily.co/medicfy-apt-3" } });
    render(wrap(<TeleconsultaVideoPane appointmentId="apt-3" accessToken="tok" />));
    expect(apiFetch).toHaveBeenCalledWith("/appointments/apt-3/video-room", { method: "POST", accessToken: "tok" });

    const iframe = await screen.findByTestId("teleconsulta-iframe");
    expect(iframe).toHaveAttribute("src", "https://medicfy.daily.co/medicfy-apt-3");
    // El proveedor pide cámara/micrófono dentro de su propio iframe.
    expect(iframe).toHaveAttribute("allow", "camera; microphone; fullscreen; display-capture");
  });

  it("explica que la teleconsulta no está configurada, sin ofrecer reintento", async () => {
    apiFetch.mockResolvedValue({ kind: "unavailable", reason: "NOT_CONFIGURED" });
    render(wrap(<TeleconsultaVideoPane appointmentId="apt-3" accessToken="tok" />));
    expect(await screen.findByText("Teleconsulta no disponible")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
  });

  it("ofrece reintentar cuando el proveedor falla", async () => {
    apiFetch.mockResolvedValueOnce({ kind: "unavailable", reason: "PROVIDER_ERROR" }).mockReturnValue(new Promise(() => {}));
    render(wrap(<TeleconsultaVideoPane appointmentId="apt-3" accessToken="tok" />));
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("muestra el estado sin conexión sin llamar al backend", () => {
    online = false;
    render(wrap(<TeleconsultaVideoPane appointmentId="apt-3" accessToken="tok" />));
    expect(screen.getByText("Sin conexión a internet")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
