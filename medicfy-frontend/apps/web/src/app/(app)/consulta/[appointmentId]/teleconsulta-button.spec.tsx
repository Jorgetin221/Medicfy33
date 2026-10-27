import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n/context";
import { TeleconsultaButton } from "./teleconsulta-button";

function wrap(ui: ReactNode) {
  return <I18nProvider initialLocale="es">{ui}</I18nProvider>;
}

describe("TeleconsultaButton", () => {
  it("no muestra nada para una cita presencial o fuera de la fase correcta", () => {
    render(wrap(<TeleconsultaButton visible={false} appointmentId="apt-1" />));
    expect(screen.queryByRole("button", { name: "Iniciar teleconsulta" })).not.toBeInTheDocument();
  });

  it("muestra el botón para una cita en línea en curso, y abre /teleconsulta/:id en pestaña nueva", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(wrap(<TeleconsultaButton visible={true} appointmentId="apt-3" />));
    fireEvent.click(screen.getByRole("button", { name: "Iniciar teleconsulta" }));
    expect(open).toHaveBeenCalledWith("/teleconsulta/apt-3", "_blank", "noopener");
  });
});
