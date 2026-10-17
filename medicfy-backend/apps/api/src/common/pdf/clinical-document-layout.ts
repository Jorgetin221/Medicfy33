import PDFDocument from "pdfkit";

// Diseño impreso de la receta y la orden de estudios (2026-10-16:
// "deben tener un buen prototipo y un bonito formato para que luzca
// presentable"). Vive aquí, sin decoradores ni dependencias de Nest,
// por una razón concreta: dev-server.mjs (el mock local) importa este
// mismo archivo con el type-stripping de Node, así que lo que el
// médico ve en desarrollo es exactamente el documento de producción.
// Por eso: solo `import type` para tipos, nada de enums ni parameter
// properties.
//
// El CONTENIDO no cambia — mismos campos que exige §17.1 (receta) y
// M10-CA-001 (orden); solo la composición.

const MX_TIME_ZONE = "America/Mexico_City";

const COLOR = {
  brand: "#0f3d3d",
  accent: "#0f766e",
  accentSoft: "#e6f6f3",
  text: "#1f2733",
  muted: "#5b6573",
  line: "#dde2e8",
  panel: "#f5f7f8",
  warn: "#8a5a00",
  warnSoft: "#fff6e0",
  white: "#ffffff",
} as const;

const FONT = { regular: "Helvetica", bold: "Helvetica-Bold", italic: "Helvetica-Oblique" } as const;

const PAGE_MARGIN = 50;
const FOOTER_HEIGHT = 44;
const TOP_BAR_HEIGHT = 8;
const HEADER_BOX_WIDTH = 170;
const HEADER_BOX_HEIGHT = 64;
const SIGNATURE_BLOCK_WIDTH = 230;
const SIGNATURE_BLOCK_HEIGHT = 120;
const LOGO_SIZE = 60;
const LOGO_GAP = 12;

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

// Membrete del médico (Perfil → Marca). Presentación, no dato legal:
// los campos del art. 33 siguen viniendo del snapshot. Todo opcional —
// sin logo ni datos de contacto el documento se ve igual que antes.
export interface DocumentLetterhead {
  logoImage?: Buffer;
  phrase?: string;
  phone?: string;
  email?: string;
}

interface ClinicalDocumentBase {
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
  qrVerificationToken: string;
  letterhead?: DocumentLetterhead;
}

export interface PrescriptionPdfInput extends ClinicalDocumentBase {
  diagnosisSnapshot: string;
  generalInstructions?: string;
  items: PrescriptionPdfItem[];
}

export interface LabOrderPdfItem {
  studyName: string;
  loincCode?: string;
  notes?: string;
}

export interface LabOrderPdfInput extends ClinicalDocumentBase {
  clinicalIndication: string;
  fastingRequired: boolean;
  items: LabOrderPdfItem[];
  // Solo se usa cuando signatureRoute=HANDWRITTEN_AFTER_PRINT y el
  // médico ya tiene una firma visual cargada en Perfil — conveniencia
  // impresa, nunca una firma con validez legal electrónica.
  visualSignatureImage?: Buffer;
}

type Doc = PDFKit.PDFDocument;

export function renderPrescriptionPdf(input: PrescriptionPdfInput): Promise<Buffer> {
  return render(`Receta ${input.folio}`, (doc) => drawPrescription(doc, input), input);
}

export function renderLabOrderPdf(input: LabOrderPdfInput): Promise<Buffer> {
  return render(`Orden de estudios ${input.folio}`, (doc) => drawLabOrder(doc, input), input);
}

function render(title: string, draw: (doc: Doc) => void, base: ClinicalDocumentBase): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN + FOOTER_HEIGHT },
      bufferPages: true,
      // R2: el título del archivo nunca lleva nombre del paciente ni
      // contenido clínico — solo tipo de documento y folio.
      info: { Title: title, Author: "Medicfy" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    draw(doc);
    drawFooters(doc, base);
    doc.end();
  });
}

// ── Documentos ──────────────────────────────────────────────────────

function drawPrescription(doc: Doc, input: PrescriptionPdfInput): void {
  drawHeader(doc, input, "RECETA MÉDICA");
  drawPatientPanel(doc, input, [["Diagnóstico", input.diagnosisSnapshot]]);

  drawSectionTitle(doc, "Prescripción");
  doc.font(FONT.bold).fontSize(26).fillColor(COLOR.accent).text("Rx", left(doc), doc.y);
  doc.moveDown(0.2);
  input.items.forEach((item, index) => drawMedication(doc, item, index + 1));

  if (input.generalInstructions) {
    drawNoteBox(doc, "Indicaciones generales", input.generalInstructions, COLOR.accentSoft, COLOR.brand);
  }

  drawSignatureArea(doc, input, undefined);
}

function drawLabOrder(doc: Doc, input: LabOrderPdfInput): void {
  drawHeader(doc, input, "ORDEN DE ESTUDIOS");
  drawPatientPanel(doc, input, [["Indicación clínica", input.clinicalIndication]]);

  if (input.fastingRequired) {
    drawNoteBox(doc, "Importante", "Requiere ayuno.", COLOR.warnSoft, COLOR.warn);
  }

  drawSectionTitle(doc, "Estudios solicitados");
  drawStudiesTable(doc, input.items);

  drawSignatureArea(doc, input, input.visualSignatureImage);
}

// ── Bloques ─────────────────────────────────────────────────────────

function drawHeader(doc: Doc, input: ClinicalDocumentBase, title: string): void {
  const top = doc.page.margins.top;
  const letterhead = input.letterhead ?? {};
  const hasLogo = drawLogo(doc, letterhead.logoImage, left(doc), top);
  const x = left(doc) + (hasLogo ? LOGO_SIZE + LOGO_GAP : 0);
  const textWidth = contentWidth(doc) - HEADER_BOX_WIDTH - 16 - (hasLogo ? LOGO_SIZE + LOGO_GAP : 0);

  doc.save().rect(0, 0, doc.page.width, TOP_BAR_HEIGHT).fill(COLOR.accent).restore();

  doc.font(FONT.bold).fontSize(17).fillColor(COLOR.brand).text(input.doctorNameSnapshot, x, top, { width: textWidth });
  if (letterhead.phrase) doc.font(FONT.italic).fontSize(9.5).fillColor(COLOR.accent).text(letterhead.phrase, { width: textWidth });
  doc.font(FONT.regular).fontSize(10).fillColor(COLOR.muted);
  if (input.doctorSpecialtySnapshot) doc.text(input.doctorSpecialtySnapshot, { width: textWidth });
  doc.text(`Cédula profesional ${input.doctorLicenseSnapshot}`, { width: textWidth });
  if (input.doctorInstitutionSnapshot) doc.text(input.doctorInstitutionSnapshot, { width: textWidth });
  const contact = [letterhead.phone, letterhead.email].filter(Boolean).join("  ·  ");
  if (contact) doc.text(contact, { width: textWidth });
  const textBottom = Math.max(doc.y, hasLogo ? top + LOGO_SIZE : 0);

  // Desde el margen, no desde `x`: con logo, `x` ya viene recorrido.
  const boxX = left(doc) + contentWidth(doc) - HEADER_BOX_WIDTH;
  doc.save().roundedRect(boxX, top, HEADER_BOX_WIDTH, HEADER_BOX_HEIGHT, 6).fill(COLOR.accentSoft).restore();
  doc.font(FONT.bold).fontSize(12).fillColor(COLOR.brand).text(title, boxX, top + 11, { width: HEADER_BOX_WIDTH, align: "center", characterSpacing: 0.6 });
  doc.font(FONT.bold).fontSize(10).fillColor(COLOR.accent).text(`Folio ${input.folio}`, boxX, doc.y + 4, { width: HEADER_BOX_WIDTH, align: "center" });
  doc.font(FONT.regular).fontSize(9).fillColor(COLOR.muted).text(formatMxDate(input.issuedAt), boxX, doc.y + 2, { width: HEADER_BOX_WIDTH, align: "center" });

  const bottom = Math.max(textBottom, top + HEADER_BOX_HEIGHT) + 12;
  drawRule(doc, bottom, COLOR.accent, 1.5);
  doc.x = left(doc);
  doc.y = bottom + 14;
}

// Un logo dañado o en un formato que pdfkit no lee (solo PNG/JPEG) no
// debe impedir emitir la receta: se omite y el membrete queda en texto.
function drawLogo(doc: Doc, logo: Buffer | undefined, x: number, top: number): boolean {
  if (!logo) return false;
  try {
    doc.image(logo, x, top, { fit: [LOGO_SIZE, LOGO_SIZE], align: "center", valign: "center" });
    return true;
  } catch {
    return false;
  }
}

function drawPatientPanel(doc: Doc, input: ClinicalDocumentBase, rows: [string, string][]): void {
  const x = left(doc);
  const width = contentWidth(doc);
  const padding = 12;
  const innerWidth = width - padding * 2;
  const columnWidth = innerWidth / 4;

  doc.font(FONT.regular).fontSize(10.5);
  const rowsHeight = rows.reduce((sum, [, value]) => sum + 14 + doc.heightOfString(value, { width: innerWidth }) + 6, 0);
  const panelHeight = padding + 34 + rowsHeight + padding - 6;
  ensureSpace(doc, panelHeight + 16);

  const top = doc.y;
  doc.save().roundedRect(x, top, width, panelHeight, 6).fill(COLOR.panel).restore();

  const sex = input.patientSexSnapshot === "F" ? "Femenino" : input.patientSexSnapshot === "M" ? "Masculino" : input.patientSexSnapshot;
  const columns: [string, string, number][] = [
    ["PACIENTE", input.patientNameSnapshot, columnWidth * 2],
    ["EDAD", `${input.patientAgeSnapshot} años`, columnWidth],
    ["SEXO", sex, columnWidth],
  ];
  let columnX = x + padding;
  for (const [label, value, columnSpan] of columns) {
    doc.font(FONT.bold).fontSize(7.5).fillColor(COLOR.muted).text(label, columnX, top + padding, { width: columnSpan - 8, characterSpacing: 0.8 });
    doc.font(FONT.bold).fontSize(11.5).fillColor(COLOR.text).text(value, columnX, top + padding + 11, { width: columnSpan - 8, ellipsis: true, height: 16 });
    columnX += columnSpan;
  }

  let rowY = top + padding + 34;
  for (const [label, value] of rows) {
    doc.font(FONT.bold).fontSize(7.5).fillColor(COLOR.muted).text(label.toUpperCase(), x + padding, rowY, { width: innerWidth, characterSpacing: 0.8 });
    doc.font(FONT.regular).fontSize(10.5).fillColor(COLOR.text).text(value, x + padding, rowY + 11, { width: innerWidth });
    rowY = doc.y + 6;
  }

  doc.x = x;
  doc.y = top + panelHeight + 16;
}

function drawSectionTitle(doc: Doc, title: string): void {
  ensureSpace(doc, 60);
  const x = left(doc);
  doc.font(FONT.bold).fontSize(9).fillColor(COLOR.accent).text(title.toUpperCase(), x, doc.y, { characterSpacing: 1.2 });
  const y = doc.y + 3;
  doc.save().moveTo(x, y).lineTo(x + 40, y).lineWidth(2).strokeColor(COLOR.accent).stroke().restore();
  doc.x = x;
  doc.y = y + 8;
}

function drawMedication(doc: Doc, item: PrescriptionPdfItem, number: number): void {
  const x = left(doc);
  const badge = 20;
  const textX = x + badge + 12;
  const textWidth = contentWidth(doc) - badge - 12;

  const name = `${item.genericName.toUpperCase()}${item.brandName ? `  (${item.brandName})` : ""}`;
  const posology = [`Dosis: ${item.dose}`, `Vía: ${item.route}`, `Frecuencia: ${item.frequency}`, `Duración: ${item.duration}`];
  if (item.quantity) posology.push(`Cantidad: ${item.quantity}`);
  const posologyText = posology.join("   ·   ");

  doc.font(FONT.bold).fontSize(12);
  let needed = doc.heightOfString(name, { width: textWidth }) + 16;
  doc.font(FONT.regular).fontSize(10.5);
  needed += doc.heightOfString(posologyText, { width: textWidth }) + 8;
  if (item.specialInstructions) needed += doc.heightOfString(item.specialInstructions, { width: textWidth }) + 6;
  ensureSpace(doc, needed + 14);

  const top = doc.y;
  doc.save().circle(x + badge / 2, top + badge / 2 - 2, badge / 2).fill(COLOR.accent).restore();
  doc.font(FONT.bold).fontSize(10).fillColor(COLOR.white).text(String(number), x, top + 3, { width: badge, align: "center" });

  doc.font(FONT.bold).fontSize(12).fillColor(COLOR.text).text(name, textX, top, { width: textWidth });
  doc.font(FONT.regular).fontSize(9.5).fillColor(COLOR.muted).text(item.presentation, textX, doc.y + 1, { width: textWidth });
  doc.font(FONT.regular).fontSize(10.5).fillColor(COLOR.text).text(posologyText, textX, doc.y + 5, { width: textWidth });
  if (item.specialInstructions) {
    doc.font(FONT.italic).fontSize(10).fillColor(COLOR.muted).text(item.specialInstructions, textX, doc.y + 4, { width: textWidth });
  }

  const bottom = doc.y + 10;
  drawRule(doc, bottom, COLOR.line, 0.75, textX);
  doc.x = x;
  doc.y = bottom + 10;
}

function drawStudiesTable(doc: Doc, items: LabOrderPdfItem[]): void {
  const x = left(doc);
  const width = contentWidth(doc);
  const numberWidth = 30;
  const nameWidth = width * 0.5;
  const notesWidth = width - numberWidth - nameWidth;
  const cellPadding = 7;

  const drawHeaderRow = () => {
    const top = doc.y;
    doc.save().rect(x, top, width, 22).fill(COLOR.accentSoft).restore();
    doc.font(FONT.bold).fontSize(8).fillColor(COLOR.brand);
    doc.text("#", x, top + 7, { width: numberWidth, align: "center" });
    doc.text("ESTUDIO", x + numberWidth + cellPadding, top + 7, { width: nameWidth - cellPadding * 2, characterSpacing: 0.8 });
    doc.text("NOTAS", x + numberWidth + nameWidth + cellPadding, top + 7, { width: notesWidth - cellPadding * 2, characterSpacing: 0.8 });
    doc.y = top + 22;
  };

  ensureSpace(doc, 60);
  drawHeaderRow();
  items.forEach((item, index) => {
    doc.font(FONT.bold).fontSize(10.5);
    const nameHeight = doc.heightOfString(item.studyName, { width: nameWidth - cellPadding * 2 }) + (item.loincCode ? 12 : 0);
    doc.font(FONT.regular).fontSize(9.5);
    const notesHeight = item.notes ? doc.heightOfString(item.notes, { width: notesWidth - cellPadding * 2 }) : 0;
    const rowHeight = Math.max(nameHeight, notesHeight) + cellPadding * 2;
    if (doc.y + rowHeight > maxY(doc)) {
      doc.addPage();
      drawHeaderRow();
    }

    const top = doc.y;
    if (index % 2 === 1) doc.save().rect(x, top, width, rowHeight).fill(COLOR.panel).restore();
    doc.font(FONT.bold).fontSize(10).fillColor(COLOR.accent).text(String(index + 1), x, top + cellPadding, { width: numberWidth, align: "center" });
    doc.font(FONT.bold).fontSize(10.5).fillColor(COLOR.text).text(item.studyName, x + numberWidth + cellPadding, top + cellPadding, { width: nameWidth - cellPadding * 2 });
    if (item.loincCode) doc.font(FONT.regular).fontSize(8).fillColor(COLOR.muted).text(`LOINC ${item.loincCode}`, { width: nameWidth - cellPadding * 2 });
    if (item.notes) {
      doc.font(FONT.regular).fontSize(9.5).fillColor(COLOR.muted).text(item.notes, x + numberWidth + nameWidth + cellPadding, top + cellPadding, { width: notesWidth - cellPadding * 2 });
    }
    drawRule(doc, top + rowHeight, COLOR.line, 0.75);
    doc.y = top + rowHeight;
  });
  doc.x = x;
  doc.y += 16;
}

function drawNoteBox(doc: Doc, title: string, body: string, background: string, accent: string): void {
  const x = left(doc);
  const width = contentWidth(doc);
  const padding = 10;
  doc.font(FONT.regular).fontSize(10.5);
  const height = padding * 2 + 12 + doc.heightOfString(body, { width: width - padding * 2 - 4 });
  ensureSpace(doc, height + 14);

  const top = doc.y;
  doc.save().roundedRect(x, top, width, height, 5).fill(background).restore();
  doc.save().rect(x, top, 4, height).fill(accent).restore();
  doc.font(FONT.bold).fontSize(8).fillColor(accent).text(title.toUpperCase(), x + padding + 4, top + padding, { width: width - padding * 2, characterSpacing: 0.8 });
  doc.font(FONT.regular).fontSize(10.5).fillColor(COLOR.text).text(body, x + padding + 4, doc.y + 3, { width: width - padding * 2 - 4 });
  doc.x = x;
  doc.y = top + height + 14;
}

// Izquierda: cómo verificar el documento. Derecha: la firma — línea
// para firma autógrafa, firma visual cargada en Perfil, o el sello de
// firma electrónica, según la ruta elegida.
function drawSignatureArea(doc: Doc, input: ClinicalDocumentBase, visualSignature: Buffer | undefined): void {
  doc.moveDown(1);
  ensureSpace(doc, SIGNATURE_BLOCK_HEIGHT + 10);
  const x = left(doc);
  const top = doc.y;
  const signatureX = x + contentWidth(doc) - SIGNATURE_BLOCK_WIDTH;
  const verifyWidth = contentWidth(doc) - SIGNATURE_BLOCK_WIDTH - 24;

  doc.font(FONT.bold).fontSize(8).fillColor(COLOR.muted).text("VERIFICACIÓN", x, top + 40, { width: verifyWidth, characterSpacing: 0.8 });
  doc.font(FONT.regular).fontSize(9).fillColor(COLOR.text).text("Confirma la autenticidad de este documento en Medicfy:", x, doc.y + 3, { width: verifyWidth });
  doc.font(FONT.bold).fontSize(9).fillColor(COLOR.accent).text(`/verificar/${input.qrVerificationToken}`, x, doc.y + 2, { width: verifyWidth });

  if (input.signatureRoute === "ELECTRONIC") {
    drawElectronicSeal(doc, input, signatureX, top);
  } else {
    drawHandwrittenLine(doc, input, signatureX, top, visualSignature);
  }

  doc.x = x;
  doc.y = top + SIGNATURE_BLOCK_HEIGHT;
}

function drawHandwrittenLine(doc: Doc, input: ClinicalDocumentBase, x: number, top: number, visualSignature: Buffer | undefined): void {
  const lineY = top + 66;
  if (visualSignature) {
    doc.image(visualSignature, x + 25, top + 4, { fit: [SIGNATURE_BLOCK_WIDTH - 50, 58], align: "center", valign: "bottom" });
  }
  doc.save().moveTo(x, lineY).lineTo(x + SIGNATURE_BLOCK_WIDTH, lineY).lineWidth(0.9).strokeColor(COLOR.text).stroke().restore();
  doc.font(FONT.bold).fontSize(10).fillColor(COLOR.text).text(input.doctorNameSnapshot, x, lineY + 5, { width: SIGNATURE_BLOCK_WIDTH, align: "center" });
  doc.font(FONT.regular).fontSize(8.5).fillColor(COLOR.muted).text(`Cédula profesional ${input.doctorLicenseSnapshot}`, x, doc.y + 1, { width: SIGNATURE_BLOCK_WIDTH, align: "center" });
  const caption = visualSignature ? "Firma visual — no tiene validez legal electrónica" : "Firma autógrafa del médico";
  doc.font(FONT.italic).fontSize(8).fillColor(visualSignature ? COLOR.muted : COLOR.warn).text(caption, x, doc.y + 2, { width: SIGNATURE_BLOCK_WIDTH, align: "center" });
}

function drawElectronicSeal(doc: Doc, input: ClinicalDocumentBase, x: number, top: number): void {
  const height = 74;
  doc.save().roundedRect(x, top + 8, SIGNATURE_BLOCK_WIDTH, height, 6).lineWidth(1.2).strokeColor(COLOR.accent).stroke().restore();
  doc.font(FONT.bold).fontSize(8).fillColor(COLOR.accent).text("FIRMADO ELECTRÓNICAMENTE", x, top + 20, { width: SIGNATURE_BLOCK_WIDTH, align: "center", characterSpacing: 0.8 });
  doc.font(FONT.bold).fontSize(10.5).fillColor(COLOR.text).text(input.doctorNameSnapshot, x + 10, doc.y + 6, { width: SIGNATURE_BLOCK_WIDTH - 20, align: "center" });
  doc.font(FONT.regular).fontSize(8.5).fillColor(COLOR.muted).text(`Cédula profesional ${input.doctorLicenseSnapshot}`, x + 10, doc.y + 2, { width: SIGNATURE_BLOCK_WIDTH - 20, align: "center" });
  if (input.signatureTimestamp) {
    doc.text(formatMxDateTime(input.signatureTimestamp), x + 10, doc.y + 2, { width: SIGNATURE_BLOCK_WIDTH - 20, align: "center" });
  }
}

function drawFooters(doc: Doc, input: ClinicalDocumentBase): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    // Debajo del margen inferior: sin esto pdfkit abre una página nueva
    // al escribir el pie.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const x = left(doc);
    const width = contentWidth(doc);
    const y = doc.page.height - PAGE_MARGIN - FOOTER_HEIGHT + 14;
    drawRule(doc, y, COLOR.line, 0.75);
    doc.font(FONT.regular).fontSize(8).fillColor(COLOR.muted).text(input.practiceAddressSnapshot, x, y + 8, { width: width * 0.7, lineBreak: false, ellipsis: true });
    doc.text(`Folio ${input.folio}  ·  Página ${i - range.start + 1} de ${range.count}`, x + width * 0.7, y + 8, { width: width * 0.3, align: "right", lineBreak: false });
    doc.font(FONT.regular).fontSize(7).fillColor(COLOR.muted).text("Documento generado en Medicfy", x, y + 20, { width, lineBreak: false });
    doc.page.margins.bottom = bottomMargin;
  }
}

// ── Utilidades ──────────────────────────────────────────────────────

function left(doc: Doc): number {
  return doc.page.margins.left;
}

function contentWidth(doc: Doc): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function maxY(doc: Doc): number {
  return doc.page.height - doc.page.margins.bottom;
}

function ensureSpace(doc: Doc, needed: number): void {
  if (doc.y + needed > maxY(doc)) doc.addPage();
}

function drawRule(doc: Doc, y: number, color: string, width: number, fromX?: number): void {
  const x = fromX ?? left(doc);
  doc.save().moveTo(x, y).lineTo(left(doc) + contentWidth(doc), y).lineWidth(width).strokeColor(color).stroke().restore();
}

function formatMxDate(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, dateStyle: "long" }).format(date);
}

function formatMxDateTime(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, dateStyle: "long", timeStyle: "short" }).format(date);
}
