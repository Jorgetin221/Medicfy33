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
import { LabOrdersController } from "./lab-orders.controller";
import { LabResultsController } from "./lab-results.controller";
import { LabResultAnalytesController } from "./lab-result-analytes.controller";

// M10 — ÓRDENES DE LABORATORIO (parcial en MVP — ver el plan
// aprobado). FILE_STORAGE_PORT: instancia propia del mismo adapter
// que DoctorsModule usa (stateless, sin problema en tener más de una
// instancia) — más simple que exportarlo desde DoctorsModule.
@Module({
  imports: [IdentityModule, DoctorsModule, SchedulingModule],
  controllers: [LabOrdersController, LabResultsController, LabResultAnalytesController],
  providers: [
    LabOrderService,
    LabOrderPdfService,
    LabResultAnalyteService,
    CareRelationshipGuard,
    { provide: FILE_STORAGE_PORT, useClass: LocalDiskFileStorageAdapter },
  ],
  exports: [LabOrderService],
})
export class LabsModule {}
