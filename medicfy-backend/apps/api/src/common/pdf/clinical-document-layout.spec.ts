import { describe, expect, it } from "vitest";
import { renderLabOrderPdf, renderPrescriptionPdf, type PrescriptionPdfInput } from "./clinical-document-layout";

// Datos sintéticos (R7).
const base = {
  issuedAt: new Date("2026-10-16T17:30:00Z"),
  doctorNameSnapshot: "Dra. Demo Sintética",
  doctorLicenseSnapshot: "12345678",
  doctorSpecialtySnapshot: "Medicina General",
  practiceAddressSnapshot: "Consultorio de demostración",
  patientNameSnapshot: "Paciente Ficticio",
  patientAgeSnapshot: 42,
  patientSexSnapshot: "F",
  qrVerificationToken: "00000000-0000-4000-8000-000000000000",
};

function prescription(itemCount: number, signatureRoute: PrescriptionPdfInput["signatureRoute"]): PrescriptionPdfInput {
  return {
    ...base,
    folio: "RX-000001",
    signatureRoute,
    signatureTimestamp: signatureRoute === "ELECTRONIC" ? base.issuedAt : null,
    diagnosisSnapshot: "Diagnóstico de prueba",
    generalInstructions: "Indicaciones de prueba",
    items: Array.from({ length: itemCount }, (_, i) => ({
      genericName: `Medicamento ${i + 1}`,
      presentation: "Tableta 500 mg",
      dose: "500 mg",
      route: "Oral",
      frequency: "Cada 8 horas",
      duration: "7 días",
      specialInstructions: "Con alimentos",
    })),
  };
}

function pageCount(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
}

describe("clinical-document-layout", () => {
  it("genera una receta PDF válida en una página para las dos rutas de firma", async () => {
    for (const route of ["HANDWRITTEN_AFTER_PRINT", "ELECTRONIC"] as const) {
      const pdf = await renderPrescriptionPdf(prescription(2, route));
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pageCount(pdf)).toBe(1);
    }
  });

  it("una receta larga continúa en páginas nuevas en vez de cortarse", async () => {
    const pdf = await renderPrescriptionPdf(prescription(10, "ELECTRONIC"));
    expect(pageCount(pdf)).toBeGreaterThan(1);
  });

  it("el título del archivo lleva el folio y nunca el nombre del paciente (R2)", async () => {
    const pdf = (await renderPrescriptionPdf(prescription(1, "ELECTRONIC"))).toString("latin1");
    expect(pdf).toContain("Receta RX-000001");
    expect(pdf).not.toContain(base.patientNameSnapshot);
  });

  it("genera una orden de estudios PDF válida, con ayuno y firma autógrafa", async () => {
    const pdf = await renderLabOrderPdf({
      ...base,
      folio: "LAB-000001",
      signatureRoute: "HANDWRITTEN_AFTER_PRINT",
      signatureTimestamp: null,
      clinicalIndication: "Indicación de prueba",
      fastingRequired: true,
      items: [{ studyName: "Biometría hemática completa" }, { studyName: "Perfil de lípidos", loincCode: "57698-3", notes: "Nota" }],
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(pdf)).toBe(1);
  });
});
