import { describe, expect, it } from "vitest";
import { MEDICAL_FILE_ACCEPT, medicalFileMimeType, medicalFilePreview, resolveMedicalFileFormat } from "./medical-files";

describe("resolveMedicalFileFormat", () => {
  it("acepta los formatos de siempre", () => {
    expect(resolveMedicalFileFormat("resultado.pdf", "application/pdf")?.label).toBe("PDF");
    expect(resolveMedicalFileFormat("foto.JPEG", "image/jpeg")?.label).toBe("JPG");
    expect(resolveMedicalFileFormat("escaneo.png", "image/png")?.label).toBe("PNG");
  });

  it("acepta los formatos que usan los médicos aunque el navegador no reporte el tipo", () => {
    expect(resolveMedicalFileFormat("torax.dcm", "")?.label).toBe("DICOM");
    expect(resolveMedicalFileFormat("IMG_0001.HEIC", "application/octet-stream")?.label).toBe("HEIC");
    expect(resolveMedicalFileFormat("reporte.docx", "")?.label).toBe("DOCX");
    expect(resolveMedicalFileFormat("biometria.xlsx", "")?.label).toBe("XLSX");
    expect(resolveMedicalFileFormat("resultado.hl7", "")?.label).toBe("HL7");
    expect(resolveMedicalFileFormat("usg.mp4", "video/mp4")?.label).toBe("MP4");
  });

  it("sin extensión conocida, decide por el tipo MIME, salvo los genéricos", () => {
    expect(resolveMedicalFileFormat("resultado", "application/pdf")?.label).toBe("PDF");
    expect(resolveMedicalFileFormat("resultado", "application/octet-stream")).toBeNull();
  });

  it("rechaza lo que no es un documento clínico", () => {
    expect(resolveMedicalFileFormat("programa.exe", "application/x-msdownload")).toBeNull();
    expect(resolveMedicalFileFormat("pagina.html", "text/html")).toBeNull();
    expect(resolveMedicalFileFormat("dibujo.svg", "image/svg+xml")).toBeNull();
  });
});

describe("tipo al servir y vista previa", () => {
  it("deriva el tipo MIME del nombre guardado", () => {
    expect(medicalFileMimeType("lab-results/p/123-abc.dcm")).toBe("application/dicom");
    expect(medicalFileMimeType("sin-extension")).toBe("application/octet-stream");
  });

  it("sabe qué se puede ver dentro del sistema", () => {
    expect(medicalFilePreview("application/pdf")).toBe("pdf");
    expect(medicalFilePreview("image/png")).toBe("image");
    expect(medicalFilePreview("video/mp4")).toBe("video");
    expect(medicalFilePreview("text/csv")).toBe("text");
    expect(medicalFilePreview("application/dicom")).toBe("none");
  });

  it("el accept del selector incluye extensiones y tipos", () => {
    expect(MEDICAL_FILE_ACCEPT).toContain(".dcm");
    expect(MEDICAL_FILE_ACCEPT).toContain("application/pdf");
  });
});
