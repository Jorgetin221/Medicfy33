import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/lib/i18n/context";
import { DoctorPhotoEditor } from "./doctor-photo-editor";

const apiFetch = vi.fn();
const apiUpload = vi.fn();
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args), apiUpload: (...args: unknown[]) => apiUpload(...args) };
});
// jsdom no tiene canvas: el recorte real se prueba en photo-crop.spec.ts.
const CROPPED = new File(["jpg"], "foto-perfil.jpg", { type: "image/jpeg" });
const renderCroppedPhoto = vi.fn();
vi.mock("./photo-crop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./photo-crop")>();
  return { ...actual, renderCroppedPhoto: (...args: unknown[]) => renderCroppedPhoto(...args) };
});

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:foto");
  URL.revokeObjectURL = vi.fn();
});

function renderEditor(photoUrl: string | null) {
  const onChanged = vi.fn();
  render(
    <I18nProvider initialLocale="es">
      <DoctorPhotoEditor photoUrl={photoUrl} initial="J" accessToken="tok" onChanged={onChanged} />
    </I18nProvider>
  );
  return { onChanged };
}

function openModal() {
  fireEvent.click(screen.getByRole("button", { name: "Editar foto de perfil" }));
  return screen.getByRole("dialog");
}

function chooseFile(file: File) {
  fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
}

function loadChosenImage(dialog: HTMLElement) {
  const img = dialog.querySelector('img[src="blob:foto"]') as HTMLImageElement;
  Object.defineProperty(img, "naturalWidth", { value: 1200 });
  Object.defineProperty(img, "naturalHeight", { value: 800 });
  fireEvent.load(img);
}

describe("DoctorPhotoEditor", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiUpload.mockReset();
    renderCroppedPhoto.mockReset().mockResolvedValue(CROPPED);
  });

  it("muestra el avatar con el lápiz; sin foto, la inicial", () => {
    renderEditor(null);
    expect(screen.getByRole("img", { name: "Sin foto de perfil" })).toHaveTextContent("J");
    expect(screen.getByRole("button", { name: "Editar foto de perfil" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("el lápiz abre el modal; elegir → encuadrar → guardar sube la foto RECORTADA", async () => {
    const { onChanged } = renderEditor(null);
    const dialog = openModal();
    chooseFile(new File(["x"], "celular.jpg", { type: "image/jpeg" }));
    loadChosenImage(dialog);

    const framing = within(dialog).getByRole("group", { name: /Encuadre de la foto/ });
    fireEvent.keyDown(framing, { key: "+" });
    fireEvent.keyDown(framing, { key: "ArrowLeft" });
    fireEvent.change(within(dialog).getByRole("slider"), { target: { value: "2" } });

    apiUpload.mockResolvedValueOnce({ photoUrl: "http://x/p.jpg" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar foto" }));

    await waitFor(() => expect(apiUpload).toHaveBeenCalledWith("/doctors/me/photo", CROPPED, { accessToken: "tok" }));
    const [, , crop] = renderCroppedPhoto.mock.calls[0] ?? [];
    expect(crop.zoom).toBeCloseTo(2);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cancelar el encuadre vuelve a la vista de la foto sin subir nada", () => {
    renderEditor("http://x/actual.jpg");
    const dialog = openModal();
    chooseFile(new File(["x"], "otra.png", { type: "image/png" }));
    loadChosenImage(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(within(dialog).getByRole("button", { name: "Cambiar foto" })).toBeInTheDocument();
    expect(apiUpload).not.toHaveBeenCalled();
  });

  it("no acepta un formato que no es imagen", async () => {
    renderEditor(null);
    const dialog = openModal();
    chooseFile(new File(["x"], "doc.pdf", { type: "application/pdf" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("doc.pdf");
    expect(within(dialog).queryByRole("group", { name: /Encuadre/ })).not.toBeInTheDocument();
  });

  it("quitar pide confirmación y llama a DELETE", async () => {
    const { onChanged } = renderEditor("http://x/actual.jpg");
    const dialog = openModal();
    fireEvent.click(within(dialog).getByRole("button", { name: "Quitar foto" }));
    expect(apiFetch).not.toHaveBeenCalled();
    apiFetch.mockResolvedValueOnce({ removed: true });
    fireEvent.click(within(dialog).getByRole("button", { name: "Sí, quitar" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/doctors/me/photo", { method: "DELETE", accessToken: "tok" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("si el servidor rechaza la foto, el modal sigue abierto con el error", async () => {
    renderEditor(null);
    const dialog = openModal();
    chooseFile(new File(["x"], "yo.jpg", { type: "image/jpeg" }));
    loadChosenImage(dialog);
    apiUpload.mockRejectedValueOnce(new Error("boom"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar foto" }));
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
