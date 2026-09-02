import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { DoctorsModule } from "../doctors/doctors.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { RecordsModule } from "../records/records.module";
import { LabsModule } from "../labs/labs.module";
import { CareRelationshipGuard } from "../../common/guards/care-relationship.guard";
import { ContextAssemblerService } from "./services/context-assembler.service";
import { ClaudeModelAdapter } from "./services/claude-model.adapter";
import { ASSISTANT_MODEL_PORT } from "./services/assistant-model.port";
import { AssistantPassOrchestratorService } from "./services/assistant-pass-orchestrator.service";
import { AssistantController } from "./assistant.controller";

// Fase 8 — "El Segundo Lector" (docs/medicfy-58-prompts.md, Bloque 9).
// IdentityModule/DoctorsModule/SchedulingModule: mismo motivo que en
// RecordsModule/LabsModule — CareRelationshipGuard los necesita para
// resolver el médico actuante y auditar. RecordsModule/LabsModule:
// ContextAssemblerService reutiliza PatientClinicalService/
// LabResultAnalyteService (Prompt 50) en vez de duplicar consultas.
@Module({
  imports: [IdentityModule, DoctorsModule, SchedulingModule, RecordsModule, LabsModule],
  controllers: [AssistantController],
  providers: [
    ContextAssemblerService,
    AssistantPassOrchestratorService,
    CareRelationshipGuard,
    { provide: ASSISTANT_MODEL_PORT, useClass: ClaudeModelAdapter },
  ],
  exports: [ContextAssemblerService],
})
export class AssistantModule {}
