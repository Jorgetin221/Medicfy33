import { Injectable } from "@nestjs/common";
import PDFDocument from "pdfkit";

const MX_TIME_ZONE = "America/Mexico_City";

export interface PrescriptionPdfItem {
  genericName: string;
  brandName?: string;
  presentation: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  quantity?: string;
  specialInstructions?: string;
}

export interface PrescriptionPdfInput {
  folio: string;
  issuedAt: Date;
  signatureRoute: "HANDWRITTEN_AFTER_PRINT" | "ELECTRONIC";
  // null (no undefined) a propósito — el llamador pasa explícitamente
  // null para la ruta autógrafa, nunca omite el campo.
  signatureTimestamp: Date | null;
  doctorNameSnapshot: string;
  doctorLicenseSnapshot: string;
  doctorSpecialtySnapshot?: string;
  doctorInstitutionSnapshot?: string;
  practiceAddressSnapshot: string;
  patientNameSnapshot: string;
  patientAgeSnapshot: number;
  patientSexSnapshot: string;
  diagnosisSnapshot: string;
  generalInstructions?: string;
  items: PrescriptionPdfItem[];
  qrVerificationToken: string;
}

function formatMxDateTime(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, dateStyle: "long", timeStyle: "short" }).format(date);
}

// Corrección v2.1 de especificacion-plataforma-clinica-con-ia.md §17.1:
// contenido mínimo de interfaz para una receta — ni un campo más, ni
// uno menos que lo que esa sección (y §6.6 de la especificación
// congelada, que PrescriptionService.buildLegalSnapshot() ya
// implementa) exige. pdfkit en vez de un motor HTML/CSS: un documento
// de texto+tabla estructurado no necesita un navegador headless (ver
// el plan aprobado para la justificación completa de la dependencia).
@Injectable()
export class PrescriptionPdfService {
  async generate(input: PrescriptionPdfInput): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: "LETTER", margin: 50 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      this.draw(doc, input);
      doc.end();
    });
  }

  private draw(doc: PDFKit.PDFDocument, input: PrescriptionPdfInput): void {
    doc.font("Helvetica-Bold").fontSize(18).text("Medicfy", { continued: true }).font("Helvetica").fontSize(10).text("  Receta médica");
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor("#555555").text(`Folio ${input.folio}  ·  Expedida el ${formatMxDateTime(input.issuedAt)}`);
    doc.fillColor("#000000");
    doc.moveDown();

    doc.font("Helvetica-Bold").fontSize(11).text("Médico");
    doc.font("Helvetica").fontSize(10);
    doc.text(input.doctorNameSnapshot);
    if (input.doctorSpecialtySnapshot) doc.text(input.doctorSpecialtySnapshot);
    doc.text(`Cédula profesional: ${input.doctorLicenseSnapshot}`);
    if (input.doctorInstitutionSnapshot) doc.text(input.doctorInstitutionSnapshot);
    doc.text(input.practiceAddressSnapshot);
    doc.moveDown();

    doc.font("Helvetica-Bold").fontSize(11).text("Paciente");
    doc.font("Helvetica").fontSize(10);
    doc.text(`${input.patientNameSnapshot}  ·  ${input.patientAgeSnapshot} años  ·  ${input.patientSexSnapshot === "F" ? "Mujer" : "Hombre"}`);
    doc.moveDown();

    doc.font("Helvetica-Bold").fontSize(11).text("Diagnóstico");
    doc.font("Helvetica").fontSize(10).text(input.diagnosisSnapshot);
    doc.moveDown();

    doc.font("Helvetica-Bold").fontSize(11).text("Medicamentos");
    doc.moveDown(0.3);
    for (const item of input.items) {
      doc.font("Helvetica-Bold").fontSize(10).text(`${item.genericName}${item.brandName ? ` (${item.brandName})` : ""} — ${item.presentation}`);
      doc.font("Helvetica").fontSize(10);
      const parts = [item.dose, item.route, item.frequency, item.duration];
      if (item.quantity) parts.push(`Cantidad: ${item.quantity}`);
      doc.text(parts.join("  ·  "));
      if (item.specialInstructions) doc.fontSize(9).fillColor("#555555").text(item.specialInstructions).fillColor("#000000").fontSize(10);
      doc.moveDown(0.5);
    }

    if (input.generalInstructions) {
      doc.moveDown(0.3);
      doc.font("Helvetica-Bold").fontSize(11).text("Indicaciones generales");
      doc.font("Helvetica").fontSize(10).text(input.generalInstructions);
    }

    doc.moveDown(1.5);
    if (input.signatureRoute === "HANDWRITTEN_AFTER_PRINT") {
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#8a5a00").text("Firme esta receta a mano antes de entregarla al paciente.");
      doc.fillColor("#000000");
      doc.moveDown(2);
      doc.moveTo(doc.x, doc.y).lineTo(doc.x + 220, doc.y).stroke();
      doc.fontSize(9).text("Firma autógrafa del médico", doc.x, doc.y + 3);
    } else {
      doc.font("Helvetica").fontSize(9).fillColor("#555555");
      doc.text(
        `Firmada electrónicamente por ${input.doctorNameSnapshot}${input.signatureTimestamp ? ` el ${formatMxDateTime(input.signatureTimestamp)}` : ""}.`
      );
      doc.fillColor("#000000");
    }

    doc.moveDown(1.5);
    doc.fontSize(8).fillColor("#555555").text(`Verifica este documento en /verificar/${input.qrVerificationToken}`);
    doc.fillColor("#000000");
  }
}
