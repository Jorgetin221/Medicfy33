import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { DoctorsModule } from "../doctors/doctors.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { LabsModule } from "../labs/labs.module";
import { CareRelationshipGuard } from "../../common/guards/care-relationship.guard";
import { PrescriptionService } from "./services/prescription.service";
import { PrescriptionPdfService } from "./services/prescription-pdf.service";
import { MedicationCatalogService } from "./services/medication-catalog.service";
import { PrescriptionsController } from "./prescriptions.controller";
import { VerificationController } from "./verification.controller";
import { MedicationsController } from "./medications.controller";
import { FILE_STORAGE_PORT } from "../doctors/services/file-storage.port";
import { LocalDiskFileStorageAdapter } from "../doctors/services/local-disk-file-storage.adapter";

// M9 — RECETA ELECTRÓNICA (Grupos III-VI, sin IA — ver el plan
// aprobado). Importa LabsModule solo por VerificationController
// (prueba receta y orden de laboratorio en el mismo endpoint público).
// FILE_STORAGE_PORT: instancia propia del mismo adapter que
// DoctorsModule usa (stateless, sin problema en tener más de una
// instancia) — mismo patrón ya establecido en LabsModule, más simple
// que exportarlo desde DoctorsModule.
@Module({
  imports: [IdentityModule, DoctorsModule, SchedulingModule, LabsModule],
  controllers: [PrescriptionsController, VerificationController, MedicationsController],
  providers: [
    PrescriptionService,
    PrescriptionPdfService,
    MedicationCatalogService,
    CareRelationshipGuard,
    { provide: FILE_STORAGE_PORT, useClass: LocalDiskFileStorageAdapter },
  ],
})
export class PrescriptionsModule {}
