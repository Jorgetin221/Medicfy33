import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { useConfirmDialog } from "./confirm-dialog";
import { I18nProvider } from "@/lib/i18n/context";

function Harness() {
  const { askReason, dialog } = useConfirmDialog();
  const [result, setResult] = useState<string>("pendiente");
  return (
    <>
      <button type="button" onClick={async () => setResult((await askReason({ title: "Cancelar receta", label: "Motivo" })) ?? "cancelado")}>
        abrir
      </button>
      <p data-testid="result">{result}</p>
      {dialog}
    </>
  );
}

// Auditoría 2026-10-21, M-26.
describe("useConfirmDialog", () => {
  it("no acepta un motivo de menos de 15 caracteres y devuelve el texto al confirmar", async () => {
    render(
      <I18nProvider initialLocale="es">
        <Harness />
      </I18nProvider>
    );
    await userEvent.click(screen.getByRole("button", { name: "abrir" }));
    const confirmar = screen.getByRole("button", { name: "Confirmar" });
    await userEvent.type(screen.getByLabelText("Motivo"), "corto");
    expect(confirmar).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Motivo"), " pero ya suficiente");
    await userEvent.click(confirmar);
    expect(screen.getByTestId("result")).toHaveTextContent("corto pero ya suficiente");
  });

  it("cancelar devuelve null", async () => {
    render(
      <I18nProvider initialLocale="es">
        <Harness />
      </I18nProvider>
    );
    await userEvent.click(screen.getByRole("button", { name: "abrir" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByTestId("result")).toHaveTextContent("cancelado");
  });
});
