import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { RecordsModule } from "../records/records.module";
import { LabsModule } from "../labs/labs.module";
import { DoctorsModule } from "../doctors/doctors.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { CareRelationshipGuard } from "../../common/guards/care-relationship.guard";
import { RecordShareRequestsController } from "./record-share-requests.controller";
import { RecordShareAuthorizationController } from "./record-share-authorization.controller";
import { RecordShareViewerController } from "./record-share-viewer.controller";
import { RecordShareRevocationController } from "./record-share-revocation.controller";
import { RecordShareCustodianController } from "./record-share-custodian.controller";
import { RecordShareAdminController } from "./record-share-admin.controller";
import { RecordSharePatientController } from "./record-share-patient.controller";
import { RecordShareRequestService } from "./services/record-share-request.service";
import { RecordShareAuthorizationService } from "./services/record-share-authorization.service";
import { SharedSummaryService } from "./services/shared-summary.service";
import { RecordShareViewerService } from "./services/record-share-viewer.service";
import { RecordShareDoctorNotifierService } from "./services/record-share-doctor-notifier.service";
import { RecordShareRevocationService } from "./services/record-share-revocation.service";
import { RecordShareSweepService } from "./services/record-share-sweep.service";
import { RecordShareOversightService } from "./services/record-share-oversight.service";
import { RecordSharePatientInboxService } from "./services/record-share-patient-inbox.service";
import { SharedRecordGuard } from "./shared-record.guard";
import { RECORD_SHARE_NOTIFICATION_PORT } from "./record-share-notification.port";
import { ConsoleRecordShareNotificationAdapter } from "./console-record-share-notification.adapter";

// PR-EXP-02/03/04 (Bloque 1 — expediente compartido autorizado por el
// paciente). IdentityModule: JwtAuthGuard/DoctorVerifiedGuard/
// AuditService. SchedulingModule: CareRelationshipService (ya
// exportado, AUTH-RN-001). RecordsModule: PatientClinicalService
// (PR-EXP-04, ya exportado — mismo patrón de reutilización que
// ContextAssemblerService). LabsModule: LabResultAnalyteService
// (PR-EXP-04, sección "Resultados"). El servicio de solicitud resuelve
// Doctor directo por PrismaService (igual que CareRelationshipGuard)
// — no hace falta importar DoctorsModule para eso.
// RecordShareAuthorizationController NO usa JwtAuthGuard (PR-EXP-03:
// es la página pública del paciente) — solo necesita AuditService del
// mismo IdentityModule ya importado.
// PR-EXP-05: RecordShareViewerController (solo GET) + SharedRecordGuard
// (independiente de CareRelationshipGuard — ver 05-visor-medico-
// receptor.md §1) consumen SharedSummaryService.
// PR-EXP-06: NotificationsModule (avisos a médicos, M12), DoctorsModule
// (DoctorProfileService para CareRelationshipGuard de la pestaña del
// custodio — misma instancia local del guard que Records/Labs).
@Module({
  imports: [IdentityModule, DoctorsModule, SchedulingModule, RecordsModule, LabsModule, NotificationsModule],
  controllers: [
    RecordShareRequestsController,
    RecordShareAuthorizationController,
    RecordShareViewerController,
    RecordShareRevocationController,
    RecordShareCustodianController,
    RecordShareAdminController,
    RecordSharePatientController,
  ],
  providers: [
    RecordShareRequestService,
    RecordShareAuthorizationService,
    SharedSummaryService,
    RecordShareViewerService,
    SharedRecordGuard,
    CareRelationshipGuard,
    RecordShareDoctorNotifierService,
    RecordShareRevocationService,
    RecordShareSweepService,
    RecordShareOversightService,
    RecordSharePatientInboxService,
    { provide: RECORD_SHARE_NOTIFICATION_PORT, useClass: ConsoleRecordShareNotificationAdapter },
  ],
  exports: [SharedSummaryService],
})
export class RecordShareModule {}
