import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { RecordShareGrantMine } from "@medicfy/contracts";
import { I18nProvider } from "@/lib/i18n/context";
import CompartidosConmigoPage from "./page";

const apiFetch = vi.fn();
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ accessToken: "tok", isLoading: false }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const GRANT: RecordShareGrantMine = {
  id: "grant-1",
  patientName: "María José Peña",
  custodianDisplayName: "Dr. Roberto Díaz",
  scope: ["SUMMARY", "RESULTS"],
  status: "ACTIVE",
  startsAt: "2026-10-01T00:00:00Z",
  expiresAt: "2026-11-30T00:00:00Z",
};

describe("CompartidosConmigoPage", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("muestra el estado vacío cuando no hay grants", async () => {
    apiFetch.mockResolvedValue([]);
    render(
      <I18nProvider initialLocale="es">
        <CompartidosConmigoPage />
      </I18nProvider>
    );
    expect(await screen.findByText("Todavía ningún paciente te ha compartido su expediente.")).toBeInTheDocument();
  });

  it("muestra el nombre del paciente y del médico tratante (ya autorizado, no es RE5)", async () => {
    apiFetch.mockResolvedValue([GRANT]);
    render(
      <I18nProvider initialLocale="es">
        <CompartidosConmigoPage />
      </I18nProvider>
    );
    expect(await screen.findByText("María José Peña")).toBeInTheDocument();
    expect(screen.getByText(/Dr. Roberto Díaz/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver expediente" })).toHaveAttribute("href", "/expediente-compartido/compartidos-conmigo/grant-1");
  });
});
