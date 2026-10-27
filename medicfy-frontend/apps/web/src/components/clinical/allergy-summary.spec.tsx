import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AllergySummary } from "./allergy-summary";
import { I18nProvider } from "@/lib/i18n/context";
import type { PatientAllergy } from "@/lib/use-patient-clinical";

const PENICILINA: PatientAllergy = {
  id: "a1",
  patientId: "p1",
  substance: "Penicilina",
  allergyType: "MEDICAMENTO",
  reaction: "Urticaria",
  severity: "Severa",
  ageOfOnset: null,
  status: "ACTIVE",
  certainty: "CONFIRMED",
  source: "PACIENTE",
  lastReviewedAt: "2026-10-01T10:00:00Z",
};

function renderSummary(props: Parameters<typeof AllergySummary>[0]) {
  return render(
    <I18nProvider initialLocale="es">
      <AllergySummary {...props} />
    </I18nProvider>
  );
}

// Auditoría 2026-10-21, C-04: "Sin alergias" solo con respuesta
// confirmada del servidor — nunca mientras carga ni tras un error.
describe("AllergySummary — estado de carga explícito", () => {
  it("mientras carga NO afirma que no hay alergias", () => {
    renderSummary({ allergies: [], loadState: "loading" });
    expect(screen.queryByText("Sin alergias activas registradas")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Cargando alergias");
  });

  it("si la carga falló, avisa con alerta y permite reintentar — sin la palomita de 'sin alergias'", async () => {
    const onRetry = vi.fn();
    renderSummary({ allergies: [], loadState: "error", onRetry });
    expect(screen.queryByText("Sin alergias activas registradas")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar las alergias");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("con respuesta confirmada y lista vacía, dice explícitamente que no hay alergias", () => {
    renderSummary({ allergies: [], loadState: "ready" });
    expect(screen.getByText("Sin alergias activas registradas")).toBeInTheDocument();
  });

  it("con alergias activas, las pinta como alerta con icono y texto, a 16 px", () => {
    renderSummary({ allergies: [PENICILINA], loadState: "ready" });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Penicilina");
    expect(alert).toHaveTextContent("Severa — Urticaria");
    expect(alert.className).toContain("text-base");
  });
});
