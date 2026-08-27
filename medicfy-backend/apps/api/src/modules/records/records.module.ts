import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { DoctorsModule } from "../doctors/doctors.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { CareRelationshipGuard } from "../../common/guards/care-relationship.guard";
import { ClinicalEncounterService } from "./services/clinical-encounter.service";
import { IndicacionesPdfService } from "./services/indicaciones-pdf.service";
import { PatientClinicalService } from "./services/patient-clinical.service";
import { AntecedentesTemplateService } from "./services/antecedentes-template.service";
import { SpecialtyScaleService } from "./services/specialty-scale.service";
import { PatientClinicalController } from "./patient-clinical.controller";
import { EncountersController } from "./encounters.controller";
import { Icd10Controller } from "./icd10.controller";
import { NoteTemplatesController } from "./note-templates.controller";
import { AntecedentesTemplatesController } from "./antecedentes-templates.controller";
import { SpecialtyFieldSchemasController } from "./specialty-field-schemas.controller";

// M8 — EXPEDIENTE CLÍNICO ELECTRÓNICO (núcleo, sin IA — ver el plan
// aprobado). SchedulingModule/DoctorsModule: CareRelationshipGuard,
// la resolución del médico actuante, y completeWithSignedNote() (al
// firmar) los necesitan.
@Module({
  imports: [IdentityModule, DoctorsModule, SchedulingModule],
  controllers: [PatientClinicalController, EncountersController, Icd10Controller, NoteTemplatesController, AntecedentesTemplatesController, SpecialtyFieldSchemasController],
  providers: [ClinicalEncounterService, IndicacionesPdfService, PatientClinicalService, AntecedentesTemplateService, SpecialtyScaleService, CareRelationshipGuard],
  exports: [ClinicalEncounterService],
})
export class RecordsModule {}
