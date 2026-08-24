import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { IdentityModule } from "../identity/identity.module";
import { DoctorProfileService } from "./services/doctor-profile.service";
import { DoctorDocumentService } from "./services/doctor-document.service";
import { DoctorBrandingService } from "./services/doctor-branding.service";
import { PracticeLocationService } from "./services/practice-location.service";
import { ServiceOfferingService } from "./services/service-offering.service";
import { DoctorVerificationService } from "./services/doctor-verification.service";
import { FILE_STORAGE_PORT } from "./services/file-storage.port";
import { LocalDiskFileStorageAdapter } from "./services/local-disk-file-storage.adapter";
import { DOCTOR_SUSPENSION_EFFECTS } from "./services/doctor-suspension-effects.port";
import { NoOpDoctorSuspensionEffectsAdapter } from "./services/no-op-doctor-suspension-effects.adapter";
import { DoctorsController } from "./doctors.controller";
import { DoctorDocumentsController } from "./doctor-documents.controller";
import { BrandingAssetsController } from "./branding-assets.controller";
import { PracticeLocationsController } from "./practice-locations.controller";
import { DoctorServicesController } from "./doctor-services.controller";
import { AdminDoctorsController } from "./admin-doctors.controller";
import { SpecialtiesController } from "./specialties.controller";

@Module({
  // Memory storage: DoctorDocumentService needs file.buffer (not a
  // disk path) to hash the bytes and hand them to FileStoragePort.
  // Fine for the 10 MB cap in spec's validaciones — would need
  // streaming for anything larger.
  imports: [IdentityModule, MulterModule.register({ storage: memoryStorage() })],
  controllers: [
    DoctorsController,
    DoctorDocumentsController,
    BrandingAssetsController,
    PracticeLocationsController,
    DoctorServicesController,
    AdminDoctorsController,
    SpecialtiesController,
  ],
  providers: [
    DoctorProfileService,
    DoctorDocumentService,
    DoctorBrandingService,
    PracticeLocationService,
    ServiceOfferingService,
    DoctorVerificationService,
    { provide: FILE_STORAGE_PORT, useClass: LocalDiskFileStorageAdapter },
    { provide: DOCTOR_SUSPENSION_EFFECTS, useClass: NoOpDoctorSuspensionEffectsAdapter },
  ],
  exports: [DoctorProfileService],
})
export class DoctorsModule {}
