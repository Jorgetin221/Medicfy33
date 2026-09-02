import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { IdentityModule } from "../identity/identity.module";
import { DoctorsModule } from "../doctors/doctors.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { LabsModule } from "../labs/labs.module";
import { CareRelationshipGuard } from "../../common/guards/care-relationship.guard";
import { FILE_STORAGE_PORT } from "../doctors/services/file-storage.port";
import { LocalDiskFileStorageAdapter } from "../doctors/services/local-disk-file-storage.adapter";
import { ClinicalEncounterService } from "./services/clinical-encounter.service";
import { IndicacionesPdfService } from "./services/indicaciones-pdf.service";
import { PatientClinicalService } from "./services/patient-clinical.service";
import { AntecedentesTemplateService } from "./services/antecedentes-template.service";
import { SpecialtyScaleService } from "./services/specialty-scale.service";
import { ClinicalAttachmentService } from "./services/clinical-attachment.service";
import { DocumentAccessService } from "./services/document-access.service";
import { ClinicalNoteCancellationService } from "./services/clinical-note-cancellation.service";
import { NoteIntegrityService } from "./services/note-integrity.service";
import { RedFlagService } from "./services/red-flag.service";
import { PatientClinicalController } from "./patient-clinical.controller";
import { EncountersController } from "./encounters.controller";
import { Icd10Controller } from "./icd10.controller";
import { NoteTemplatesController } from "./note-templates.controller";
import { AntecedentesTemplatesController } from "./antecedentes-templates.controller";
import { SpecialtyFieldSchemasController } from "./specialty-field-schemas.controller";
import { ClinicalAttachmentsController } from "./clinical-attachments.controller";
import { DocumentViewController } from "./document-view.controller";

// M8 — EXPEDIENTE CLÍNICO ELECTRÓNICO (núcleo, sin IA — ver el plan
// aprobado). SchedulingModule/DoctorsModule: CareRelationshipGuard,
// la resolución del médico actuante, y completeWithSignedNote() (al
// firmar) los necesitan. MulterModule con memoryStorage: mismo motivo
// que DoctorsModule/LabsModule — ClinicalAttachmentService necesita
// file.buffer para el hash SHA-256, no una ruta en disco. LabsModule:
// v2.5 · Capa 3 — ClinicalEncounterService.sign() usa
// LabReferenceRangeService.evaluateForAnalyte() para congelar el
// estado de cada analito seleccionado en note_lab_results.
@Module({
  imports: [IdentityModule, DoctorsModule, SchedulingModule, LabsModule, MulterModule.register({ storage: memoryStorage() })],
  controllers: [
    PatientClinicalController,
    EncountersController,
    Icd10Controller,
    NoteTemplatesController,
    AntecedentesTemplatesController,
    SpecialtyFieldSchemasController,
    ClinicalAttachmentsController,
    DocumentViewController,
  ],
  providers: [
    ClinicalEncounterService,
    IndicacionesPdfService,
    PatientClinicalService,
    AntecedentesTemplateService,
    SpecialtyScaleService,
    ClinicalAttachmentService,
    DocumentAccessService,
    ClinicalNoteCancellationService,
    NoteIntegrityService,
    RedFlagService,
    CareRelationshipGuard,
    { provide: FILE_STORAGE_PORT, useClass: LocalDiskFileStorageAdapter },
  ],
  // PatientClinicalService: Fase 8 · Prompt 50 (assistant/context-
  // assembler.service.ts) reutiliza listAllergies/listMedications/
  // activeDiagnoses/listHistoryItems/getActivePregnancy/notesTimeline
  // en vez de duplicar sus consultas.
  exports: [ClinicalEncounterService, PatientClinicalService],
})
export class RecordsModule {}
