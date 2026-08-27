import { HttpStatus, Injectable } from "@nestjs/common";
import PDFDocument from "pdfkit";
import { ApiException } from "../../../common/api-exception";
import { PrismaService } from "../../../prisma/prisma.service";
import { AuditService } from "../../identity/services/audit.service";

const MX_TIME_ZONE = "America/Mexico_City";

function formatMxDateTime(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, dateStyle: "long", timeStyle: "short" }).format(date);
}

function formatMxDate(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, dateStyle: "long" }).format(date);
}

// Prompt 37/38A (Fase 4) — el documento de INDICACIONES AL PACIENTE:
// qué hacer, cuidados, signos de alarma y cuándo regresar, en lenguaje
// para el paciente. PDF independiente (prompt 38A: "cada documento se
// genera por separado — el paciente recibe solo lo que le corresponde"),
// emitido desde la NOTA FIRMADA, con nombre y cédula del médico, y su
// emisión/impresión queda en bitácora. Mismo patrón pdfkit que
// PrescriptionPdfService / LabOrderPdfService.
@Injectable()
export class IndicacionesPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async generate(encounterId: string, patientId: string, actorUserId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const encounter = await this.prisma.clinicalEncounter.findUnique({
      where: { id: encounterId },
      include: {
        notes: { orderBy: { createdAt: "desc" }, take: 1 },
        patient: true,
        doctor: { include: { primarySpecialty: true } },
      },
    });
    if (!encounter || encounter.patientId !== patientId || encounter.status !== "SIGNED" || encounter.notes.length === 0) {
      // Prompt 32/38A: los documentos salen de una nota FIRMADA.
      throw new ApiException(
        "INDICACIONES_REQUIRE_SIGNED_NOTE",
        "Las indicaciones se emiten desde una nota firmada de este paciente.",
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }
    const note = encounter.notes[0];
    if (!note) throw new Error("unreachable: length checked above");
    if (!note.patientInstructions) {
      throw new ApiException(
        "INDICACIONES_EMPTY",
        "La nota firmada no capturó indicaciones al paciente — no hay documento que emitir.",
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }

    const buffer = await this.draw({
      signedAt: encounter.signedAt,
      doctorName: `${encounter.doctor.legalFirstName} ${encounter.doctor.legalLastName}`,
      doctorLicense: encounter.doctor.professionalLicense,
      doctorSpecialty: encounter.doctor.primarySpecialty?.nameEs ?? null,
      patientName: [encounter.patient.firstName, encounter.patient.lastNamePaternal, encounter.patient.lastNameMaternal].filter(Boolean).join(" "),
      patientInstructions: note.patientInstructions,
      suggestedFollowUpDays: note.suggestedFollowUpDays,
    });

    // Prompt 38A: bitácora de emisión por documento.
    await this.audit.log({
      actorUserId,
      action: "DOCUMENT_EMITTED",
      resourceType: "CLINICAL_NOTE",
      resourceId: note.id,
      patientId,
      result: "SUCCESS",
      metadata: { documentType: "INDICACIONES", encounterId },
    });

    return { buffer, contentType: "application/pdf" };
  }

  private draw(input: {
    signedAt: Date | null;
    doctorName: string;
    doctorLicense: string;
    doctorSpecialty: string | null;
    patientName: string;
    patientInstructions: string;
    suggestedFollowUpDays: number | null;
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: "LETTER", margin: 50 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.fontSize(16).text("Indicaciones para el paciente", { align: "center" });
      doc.moveDown(0.5);
      if (input.signedAt) {
        doc.fontSize(10).text(`Consulta firmada: ${formatMxDateTime(input.signedAt)}`, { align: "center" });
      }
      doc.moveDown();
      doc.fontSize(11).text(`Paciente: ${input.patientName}`);
      doc.moveDown();
      doc.fontSize(12).text(input.patientInstructions, { lineGap: 3 });
      doc.moveDown();
      if (input.suggestedFollowUpDays !== null) {
        const followUp = new Date((input.signedAt ?? new Date()).getTime() + input.suggestedFollowUpDays * 24 * 60 * 60 * 1000);
        doc.fontSize(12).text(`Próxima cita sugerida: en ${input.suggestedFollowUpDays} días (alrededor del ${formatMxDate(followUp)}).`);
        doc.moveDown();
      }
      doc.moveDown(2);
      doc.fontSize(11).text(input.doctorName, { align: "right" });
      if (input.doctorSpecialty) doc.fontSize(10).text(input.doctorSpecialty, { align: "right" });
      doc.fontSize(10).text(`Cédula profesional: ${input.doctorLicense}`, { align: "right" });
      doc.end();
    });
  }
}
