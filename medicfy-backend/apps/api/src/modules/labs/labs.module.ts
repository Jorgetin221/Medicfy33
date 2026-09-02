import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { DoctorsModule } from "../doctors/doctors.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { CareRelationshipGuard } from "../../common/guards/care-relationship.guard";
import { FILE_STORAGE_PORT } from "../doctors/services/file-storage.port";
import { LocalDiskFileStorageAdapter } from "../doctors/services/local-disk-file-storage.adapter";
import { LabOrderService } from "./services/lab-order.service";
import { LabOrderPdfService } from "./services/lab-order-pdf.service";
import { LabResultAnalyteService } from "./services/lab-result-analyte.service";
import { LAB_OCR_PORT } from "./services/lab-ocr.port";
import { ClaudeLabOcrAdapter } from "./services/claude-lab-ocr.adapter";
import { LabSheetExtractionService } from "./services/lab-sheet-extraction.service";
import { LabReferenceRangeService } from "./services/lab-reference-range.service";
import { LabOrdersController } from "./lab-orders.controller";
import { LabResultsController } from "./lab-results.controller";
import { LabResultAnalytesController } from "./lab-result-analytes.controller";
import { LabSheetExtractionController } from "./lab-sheet-extraction.controller";
import { LabReferenceRangesController } from "./lab-reference-ranges.controller";

// M10 — ÓRDENES DE LABORATORIO (parcial en MVP — ver el plan
// aprobado). FILE_STORAGE_PORT: instancia propia del mismo adapter
// que DoctorsModule usa (stateless, sin problema en tener más de una
// instancia) — más simple que exportarlo desde DoctorsModule.
@Module({
  imports: [IdentityModule, DoctorsModule, SchedulingModule],
  controllers: [
    LabOrdersController,
    LabResultsController,
    LabResultAnalytesController,
    LabSheetExtractionController,
    LabReferenceRangesController,
  ],
  providers: [
    LabOrderService,
    LabOrderPdfService,
    LabResultAnalyteService,
    LabSheetExtractionService,
    LabReferenceRangeService,
    CareRelationshipGuard,
    { provide: FILE_STORAGE_PORT, useClass: LocalDiskFileStorageAdapter },
    { provide: LAB_OCR_PORT, useClass: ClaudeLabOcrAdapter },
  ],
  // LabResultAnalyteService: Fase 8 · Prompt 50 (assistant/context-
  // assembler.service.ts) reutiliza listForPatient() para el bloque
  // "Laboratorio" en vez de duplicar la consulta. LabReferenceRangeService:
  // records/clinical-encounter.service.ts (Capa 3, congelado en
  // sign()) y assistant/context-assembler.service.ts (Capa 4) la
  // necesitan para el mismo cálculo de estado.
  exports: [LabOrderService, LabResultAnalyteService, LabReferenceRangeService],
})
export class LabsModule {}
