import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { DoctorsModule } from "../doctors/doctors.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { CareRelationshipGuard } from "../../common/guards/care-relationship.guard";
import { TreatmentProtocolService } from "./services/treatment-protocol.service";
import { PatientProtocolInstanceService } from "./services/patient-protocol-instance.service";
import { ProtocolsController } from "./protocols.controller";
import { PatientProtocolInstancesController } from "./patient-protocol-instances.controller";

// Fase 7 — PROTOCOLOS LONGITUDINALES (prompt 47/48). SchedulingModule/
// DoctorsModule: CareRelationshipGuard los necesita, mismo patrón que
// RecordsModule/LabsModule.
@Module({
  imports: [IdentityModule, DoctorsModule, SchedulingModule],
  controllers: [ProtocolsController, PatientProtocolInstancesController],
  providers: [TreatmentProtocolService, PatientProtocolInstanceService, CareRelationshipGuard],
})
export class ProtocolsModule {}
