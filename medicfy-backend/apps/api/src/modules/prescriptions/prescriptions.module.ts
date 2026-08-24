import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { DoctorsModule } from "../doctors/doctors.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { LabsModule } from "../labs/labs.module";
import { CareRelationshipGuard } from "../../common/guards/care-relationship.guard";
import { PrescriptionService } from "./services/prescription.service";
import { PrescriptionsController } from "./prescriptions.controller";
import { VerificationController } from "./verification.controller";
import { MedicationsController } from "./medications.controller";

// M9 — RECETA ELECTRÓNICA (Grupos III-VI, sin IA — ver el plan
// aprobado). Importa LabsModule solo por VerificationController
// (prueba receta y orden de laboratorio en el mismo endpoint público).
@Module({
  imports: [IdentityModule, DoctorsModule, SchedulingModule, LabsModule],
  controllers: [PrescriptionsController, VerificationController, MedicationsController],
  providers: [PrescriptionService, CareRelationshipGuard],
})
export class PrescriptionsModule {}
