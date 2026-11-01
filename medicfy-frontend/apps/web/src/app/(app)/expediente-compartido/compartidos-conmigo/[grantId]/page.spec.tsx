import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { RecordShareGrantDetail } from "@medicfy/contracts";
import { I18nProvider } from "@/lib/i18n/context";
import ExpedienteCompartidoVisorPage from "./page";

const apiFetch = vi.fn();
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ accessToken: "tok", isLoading: false }) }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ grantId: "grant-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/use-doctor-profile", () => ({
  useDoctorProfile: () => ({ doctor: { displayName: null, legalFirstName: "Roberto", legalLastName: "Díaz", professionalLicense: "1234567" }, isLoading: false, error: null, reload: vi.fn() }),
}));

const DETAIL: RecordShareGrantDetail = {
  id: "grant-1",
  patientName: "María José Peña",
  patientBirthDate: "1990-03-15",
  custodianDisplayName: "Dr. Roberto Díaz",
  scope: ["SUMMARY", "RESULTS"],
  status: "ACTIVE",
  expiresAt: "2026-11-30T00:00:00Z",
  summary: {
    allergies: [{ id: "a1", substance: "Penicilina", allergyType: "MEDICATION", severity: "GRAVE", reaction: "Urticaria", certainty: "CONFIRMED", status: "ACTIVE" }],
    medications: [],
    activeDiagnoses: [{ icd10Code: "E11.9", description: "Diabetes mellitus tipo 2", diagnosisType: "PRINCIPAL", certainty: "CONFIRMED", firstRecordedAt: "2026-01-01T00:00:00Z", lastRecordedAt: "2026-01-01T00:00:00Z" }],
    historyItems: [],
    pregnancy: null,
    latestVitals: null,
    results: [{ analyteName: "Glucosa", value: 95, unit: "mg/dL", referenceMin: 70, referenceMax: 100, measuredAt: "2026-01-15T00:00:00Z" }],
    signedNotes: null,
    prescriptions: null,
    studyOrders: null,
  },
};

function renderPage() {
  return render(
    <I18nProvider initialLocale="es">
      <ExpedienteCompartidoVisorPage />
    </I18nProvider>
  );
}

describe("ExpedienteCompartidoVisorPage", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("pide el detalle del grant correcto al montar", async () => {
    apiFetch.mockResolvedValue(DETAIL);
    renderPage();
    await screen.findByText("María José Peña");
    expect(apiFetch).toHaveBeenCalledWith("/record-share/grants/grant-1", { accessToken: "tok" });
  });

  it("muestra alergias primero, con la etiqueta de solo lectura, y las secciones no otorgadas no aparecen", async () => {
    apiFetch.mockResolvedValue(DETAIL);
    renderPage();
    await screen.findByText("María José Peña");

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings[0]).toBe("Alergias");

    expect(screen.getByText(/Penicilina/)).toBeInTheDocument();
    expect(screen.getByText(/compartido por el paciente/i)).toBeInTheDocument();
    // signedNotes/prescriptions/studyOrders son null en este fixture (no otorgados): sin sección.
    expect(screen.queryByText("Notas firmadas")).not.toBeInTheDocument();
    expect(screen.queryByText("Recetas")).not.toBeInTheDocument();
  });

  it("no muestra ningún botón de editar/escribir (visor de solo lectura)", async () => {
    apiFetch.mockResolvedValue(DETAIL);
    renderPage();
    await screen.findByText("María José Peña");
    expect(screen.queryByRole("button", { name: /editar|guardar|firmar|emitir/i })).not.toBeInTheDocument();
  });

  it("un enlace inválido (403/404) muestra el error sin romper la pantalla", async () => {
    apiFetch.mockRejectedValue(new Error("403"));
    renderPage();
    expect(await screen.findByRole("link", { name: "Volver a la bandeja" })).toBeInTheDocument();
  });
});
