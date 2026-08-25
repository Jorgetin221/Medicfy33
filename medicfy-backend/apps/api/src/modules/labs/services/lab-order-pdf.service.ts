import { Injectable } from "@nestjs/common";
import PDFDocument from "pdfkit";

const MX_TIME_ZONE = "America/Mexico_City";

export interface LabOrderPdfItem {
  studyName: string;
  loincCode?: string;
  notes?: string;
}

export interface LabOrderPdfInput {
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
  clinicalIndication: string;
  fastingRequired: boolean;
  items: LabOrderPdfItem[];
  qrVerificationToken: string;
  // Solo se usa cuando signatureRoute=HANDWRITTEN_AFTER_PRINT y el
  // médico ya tiene una firma visual cargada en Perfil — conveniencia
  // impresa, nunca una firma con validez legal electrónica (mismo
  // principio que ya declara la propia pantalla de Perfil).
  visualSignatureImage?: Buffer;
}

function formatMxDateTime(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, dateStyle: "long", timeStyle: "short" }).format(date);
}

// M10-CA-001: "la orden en PDF contiene folio, datos del médico con
// cédula, datos del paciente, estudios, indicación e instrucciones
// de ayuno" — ni un campo más, ni uno menos. Mismo patrón que
// PrescriptionPdfService (pdfkit, ya justificado en esta sesión).
@Injectable()
export class LabOrderPdfService {
  async generate(input: LabOrderPdfInput): Promise<Buffer> {
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

  private draw(doc: PDFKit.PDFDocument, input: LabOrderPdfInput): void {
    doc.font("Helvetica-Bold").fontSize(18).text("Medicfy", { continued: true }).font("Helvetica").fontSize(10).text("  Orden de laboratorio");
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

    doc.font("Helvetica-Bold").fontSize(11).text("Indicación clínica");
    doc.font("Helvetica").fontSize(10).text(input.clinicalIndication);
    if (input.fastingRequired) {
      doc.moveDown(0.3);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#8a5a00").text("Requiere ayuno.");
      doc.fillColor("#000000");
    }
    doc.moveDown();

    doc.font("Helvetica-Bold").fontSize(11).text("Estudios solicitados");
    doc.moveDown(0.3);
    for (const item of input.items) {
      doc.font("Helvetica-Bold").fontSize(10).text(item.studyName + (item.loincCode ? ` (LOINC ${item.loincCode})` : ""));
      if (item.notes) doc.font("Helvetica").fontSize(9).fillColor("#555555").text(item.notes).fillColor("#000000");
      doc.moveDown(0.4);
    }

    doc.moveDown(1.5);
    if (input.signatureRoute === "HANDWRITTEN_AFTER_PRINT") {
      if (input.visualSignatureImage) {
        doc.font("Helvetica").fontSize(8).fillColor("#555555").text("Firma visual — no tiene validez legal electrónica.");
        doc.fillColor("#000000");
        doc.moveDown(0.3);
        doc.image(input.visualSignatureImage, doc.x, doc.y, { fit: [180, 70] });
        doc.moveDown(4);
      } else {
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#8a5a00").text("Firme esta orden a mano antes de entregarla al paciente.");
        doc.fillColor("#000000");
        doc.moveDown(2);
        doc.moveTo(doc.x, doc.y).lineTo(doc.x + 220, doc.y).stroke();
        doc.fontSize(9).text("Firma autógrafa del médico", doc.x, doc.y + 3);
      }
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
