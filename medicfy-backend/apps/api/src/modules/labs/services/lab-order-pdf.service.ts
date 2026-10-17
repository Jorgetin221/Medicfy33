import { Injectable } from "@nestjs/common";
import { renderLabOrderPdf, type LabOrderPdfInput } from "../../../common/pdf/clinical-document-layout";

export type { LabOrderPdfInput, LabOrderPdfItem } from "../../../common/pdf/clinical-document-layout";

// M10-CA-001: "la orden en PDF contiene folio, datos del médico con
// cédula, datos del paciente, estudios, indicación e instrucciones
// de ayuno" — ni un campo más, ni uno menos. Mismo diseño que la
// receta (clinical-document-layout.ts, compartido con el mock).
@Injectable()
export class LabOrderPdfService {
  generate(input: LabOrderPdfInput): Promise<Buffer> {
    return renderLabOrderPdf(input);
  }
}
