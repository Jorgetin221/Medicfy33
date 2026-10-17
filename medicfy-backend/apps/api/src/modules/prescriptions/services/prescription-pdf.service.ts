import { Injectable } from "@nestjs/common";
import { renderPrescriptionPdf, type PrescriptionPdfInput } from "../../../common/pdf/clinical-document-layout";

export type { PrescriptionPdfInput, PrescriptionPdfItem } from "../../../common/pdf/clinical-document-layout";

// Corrección v2.1 de especificacion-plataforma-clinica-con-ia.md §17.1:
// contenido mínimo de interfaz para una receta — ni un campo más, ni
// uno menos que lo que esa sección (y §6.6 de la especificación
// congelada, que PrescriptionService.buildLegalSnapshot() ya
// implementa) exige. pdfkit en vez de un motor HTML/CSS: un documento
// de texto+tabla estructurado no necesita un navegador headless. El
// diseño vive en clinical-document-layout.ts (compartido con el mock).
@Injectable()
export class PrescriptionPdfService {
  generate(input: PrescriptionPdfInput): Promise<Buffer> {
    return renderPrescriptionPdf(input);
  }
}
