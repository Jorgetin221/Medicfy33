import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { DoctorsModule } from "../doctors/doctors.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { CareRelationshipGuard } from "../../common/guards/care-relationship.guard";
import { AtlasController } from "./atlas.controller";
import { AtlasSessionService } from "./services/atlas-session.service";
import { AtlasHttpAdapter } from "./services/atlas-http.adapter";
import { ATLAS_API_PORT } from "./services/atlas-api.port";

// Atlas Anatómico 3D. IdentityModule/DoctorsModule/SchedulingModule:
// mismo motivo que en AssistantModule — CareRelationshipGuard los
// necesita para resolver el médico actuante y auditar.
@Module({
  imports: [IdentityModule, DoctorsModule, SchedulingModule],
  controllers: [AtlasController],
  providers: [
    AtlasSessionService,
    CareRelationshipGuard,
    { provide: ATLAS_API_PORT, useFactory: () => new AtlasHttpAdapter() },
  ],
})
export class AtlasModule {}
