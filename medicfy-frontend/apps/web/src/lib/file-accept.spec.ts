import { describe, expect, it } from "vitest";
import { acceptLabel, fileMatchesAccept } from "./file-accept";

describe("fileMatchesAccept", () => {
  it("acepta por tipo MIME exacto", () => {
    expect(fileMatchesAccept({ name: "resultado.pdf", type: "application/pdf" }, "application/pdf,image/png")).toBe(true);
  });

  it("acepta por extensión aunque el navegador no reporte el tipo", () => {
    expect(fileMatchesAccept({ name: "Logo.PNG", type: "" }, ".png,.jpg")).toBe(true);
  });

  it("acepta comodines de tipo", () => {
    expect(fileMatchesAccept({ name: "foto.webp", type: "image/webp" }, "image/*")).toBe(true);
  });

  it("rechaza lo que no está en la lista", () => {
    expect(fileMatchesAccept({ name: "notas.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }, "application/pdf,image/jpeg,image/png")).toBe(false);
    expect(fileMatchesAccept({ name: "sin-tipo", type: "" }, "application/pdf")).toBe(false);
  });
});

describe("acceptLabel", () => {
  it("lista los formatos legibles y sin repetir", () => {
    expect(acceptLabel("image/png,image/jpeg")).toBe("PNG, JPG");
    expect(acceptLabel("application/pdf,image/jpeg,image/png,.jpg")).toBe("PDF, JPG, PNG");
  });
});
