import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/lib/i18n/context";
import { DoctorPhotoUploader } from "./doctor-photo-uploader";

const apiFetch = vi.fn();
const apiUpload = vi.fn();
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args), apiUpload: (...args: unknown[]) => apiUpload(...args) };
});

function renderUploader(photoUrl: string | null, onChanged = vi.fn()) {
  render(
    <I18nProvider initialLocale="es">
      <DoctorPhotoUploader photoUrl={photoUrl} initial="E" accessToken="tok" onChanged={onChanged} />
    </I18nProvider>
  );
  return { onChanged, input: document.querySelector('input[type="file"]') as HTMLInputElement };
}

function pick(input: HTMLInputElement, file: File) {
  fireEvent.change(input, { target: { files: [file] } });
}

describe("DoctorPhotoUploader", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiUpload.mockReset();
  });

  it("sin foto muestra la inicial y 'Subir foto', sin opción de quitar", () => {
    renderUploader(null);
    expect(screen.getByRole("img", { name: "Sin foto de perfil" })).toHaveTextContent("E");
    expect(screen.getByRole("button", { name: "Subir foto" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar foto" })).not.toBeInTheDocument();
  });

  it("con foto la muestra y ofrece cambiar y quitar", () => {
    renderUploader("http://localhost:3001/doctors/x/public/photo/a.jpg");
    expect(screen.getByRole("img", { name: "Tu foto de perfil" })).toHaveAttribute("src", "http://localhost:3001/doctors/x/public/photo/a.jpg");
    expect(screen.getByRole("button", { name: "Cambiar foto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar foto" })).toBeInTheDocument();
  });

  it("sube una imagen válida y avisa a la pantalla para recargar el perfil", async () => {
    apiUpload.mockResolvedValueOnce({ photoUrl: "http://x/photo.jpg" });
    const { input, onChanged } = renderUploader(null);
    const file = new File(["jpg"], "yo.jpg", { type: "image/jpeg" });
    pick(input, file);
    await waitFor(() => expect(apiUpload).toHaveBeenCalledWith("/doctors/me/photo", file, { accessToken: "tok" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("no sube un formato no permitido ni una foto de más de 5 MB", async () => {
    const { input } = renderUploader(null);
    pick(input, new File(["x"], "doc.pdf", { type: "application/pdf" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("doc.pdf");

    const big = new File(["x"], "grande.jpg", { type: "image/jpeg" });
    Object.defineProperty(big, "size", { value: 5 * 1024 * 1024 + 1 });
    pick(input, big);
    expect(await screen.findByText("La foto pesa más de 5 MB. Elige una más ligera.")).toBeInTheDocument();
    expect(apiUpload).not.toHaveBeenCalled();
  });

  it("quitar pide confirmación y luego llama a DELETE", async () => {
    apiFetch.mockResolvedValueOnce({ removed: true });
    const { onChanged } = renderUploader("http://x/photo.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Quitar foto" }));
    expect(apiFetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sí, quitar" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/doctors/me/photo", { method: "DELETE", accessToken: "tok" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("si el servidor rechaza la foto, muestra el error", async () => {
    apiUpload.mockRejectedValueOnce(new Error("boom"));
    const { input, onChanged } = renderUploader(null);
    pick(input, new File(["jpg"], "yo.jpg", { type: "image/jpeg" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
