import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { PatientAccountAccessService } from "./patient-account-access.service";
import { PatientActivationService } from "./services/patient-activation.service";
import { PatientLinkRequestService } from "./services/patient-link-request.service";
import { PatientActivationController } from "./patient-activation.controller";
import { PatientAccountLinksController } from "./patient-account-links.controller";
import { PatientLinkRequestsController } from "./patient-link-requests.controller";

// Vinculación entre pacientes creados por el médico y cuentas de
// paciente — que nunca existan dos expedientes de la misma persona.
// Vive aparte porque cruza dos módulos: identity (cuentas, sesión,
// consentimientos, auditoría — AuthService/AuditService exportados) y
// scheduling (expedientes y vínculo médico-paciente —
// SchedulingAuthService exportado). La detección por teléfono al
// registrarse sí vive en AuthService.registerPatient: es parte de la
// misma transacción que crea la cuenta.
@Module({
  imports: [IdentityModule, SchedulingModule],
  controllers: [PatientActivationController, PatientAccountLinksController, PatientLinkRequestsController],
  providers: [PatientAccountAccessService, PatientActivationService, PatientLinkRequestService],
})
export class PatientAccountsModule {}
