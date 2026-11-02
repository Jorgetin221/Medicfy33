import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-client";
import { I18nProvider } from "@/lib/i18n/context";
import HomePage from "./page";

const apiFetch = vi.fn();
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});
let accessToken: string | null = null;
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ accessToken, isLoading: false }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
// El header (SiteHeader) no es lo que se prueba aquí.
vi.mock("@/components/site-header", () => ({ SiteHeader: () => null }));

function tokenFor(primaryRole: string): string {
  const payload = btoa(JSON.stringify({ sub: "u1", primaryRole })).replace(/=+$/, "");
  return `h.${payload}.s`;
}

function renderHome() {
  render(
    <I18nProvider initialLocale="es">
      <HomePage />
    </I18nProvider>
  );
}

describe("Portada — sección 'Tus médicos'", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockImplementation((path: string) => {
      if (path.startsWith("/doctors/public")) return Promise.resolve({ items: [], nextCursor: null });
      if (path === "/patients/me/doctors") {
        return Promise.reject(new ApiError("PATIENT_PROFILE_NOT_FOUND", "Todavía no tienes un expediente de paciente propio.", 404));
      }
      return Promise.resolve([]);
    });
  });

  it("con sesión de MÉDICO no la pide ni muestra error (el error del VPS)", async () => {
    accessToken = tokenFor("DOCTOR");
    renderHome();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/doctors/public?limit=6"));
    expect(apiFetch).not.toHaveBeenCalledWith("/patients/me/doctors", expect.anything());
    expect(screen.queryByText("Todavía no tienes un expediente de paciente propio.")).not.toBeInTheDocument();
  });

  it("un paciente sin expediente propio todavía no ve un error, solo no ve la sección", async () => {
    accessToken = tokenFor("PATIENT");
    renderHome();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/patients/me/doctors", { accessToken }));
    expect(screen.queryByText("Todavía no tienes un expediente de paciente propio.")).not.toBeInTheDocument();
  });

  it("un paciente con médicos sí ve la sección", async () => {
    accessToken = tokenFor("PATIENT");
    apiFetch.mockImplementation((path: string) => {
      if (path.startsWith("/doctors/public")) return Promise.resolve({ items: [], nextCursor: null });
      if (path === "/patients/me/doctors") return Promise.resolve([{ id: "d1", slug: "dra-ana", displayName: "Dra. Ana", photoUrl: null, primarySpecialtyName: null }]);
      return Promise.resolve([]);
    });
    renderHome();
    expect(await screen.findByText("Dra. Ana")).toBeInTheDocument();
  });
});
