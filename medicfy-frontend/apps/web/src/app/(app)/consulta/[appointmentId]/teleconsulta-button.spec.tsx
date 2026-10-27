import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n/context";
import { TeleconsultaButton } from "./teleconsulta-button";

function wrap(ui: ReactNode) {
  return <I18nProvider initialLocale="es">{ui}</I18nProvider>;
}

describe("TeleconsultaButton", () => {
  it("llama a onClick al presionar 'Iniciar teleconsulta'", () => {
    const onClick = vi.fn();
    render(wrap(<TeleconsultaButton onClick={onClick} />));
    fireEvent.click(screen.getByRole("button", { name: "Iniciar teleconsulta" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
