import { forwardRef, Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { IdentityModule } from "../identity/identity.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { DoctorProfileService } from "./services/doctor-profile.service";
import { DoctorDocumentService } from "./services/doctor-document.service";
import { DoctorBrandingService } from "./services/doctor-branding.service";
import { PracticeLocationService } from "./services/practice-location.service";
import { ServiceOfferingService } from "./services/service-offering.service";
import { DoctorVerificationService } from "./services/doctor-verification.service";
import { FILE_STORAGE_PORT } from "./services/file-storage.port";
import { LocalDiskFileStorageAdapter } from "./services/local-disk-file-storage.adapter";
import { DOCTOR_SUSPENSION_EFFECTS } from "./services/doctor-suspension-effects.port";
import { AppointmentCancellationSuspensionAdapter } from "./services/appointment-cancellation-suspension.adapter";
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
  // forwardRef: SchedulingModule ya importa DoctorsModule. Ahora
  // DoctorsModule también necesita algo de SchedulingModule
  // (AppointmentStateMachineService, para AppointmentCancellationSuspensionAdapter)
  // — ciclo legítimo en ambos sentidos, resuelto como Nest documenta
  // para este caso exacto.
  imports: [IdentityModule, forwardRef(() => SchedulingModule), MulterModule.register({ storage: memoryStorage() })],
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
    { provide: DOCTOR_SUSPENSION_EFFECTS, useClass: AppointmentCancellationSuspensionAdapter },
  ],
  exports: [DoctorProfileService],
})
export class DoctorsModule {}
