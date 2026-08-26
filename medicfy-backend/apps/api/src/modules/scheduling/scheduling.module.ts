import { forwardRef, Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { DoctorsModule } from "../doctors/doctors.module";
import { SchedulingAuthService } from "./services/scheduling-auth.service";
import { AvailabilityRuleService } from "./services/availability-rule.service";
import { AvailabilityExceptionService } from "./services/availability-exception.service";
import { AvailabilitySlotService } from "./services/availability-slot.service";
import { CareRelationshipService } from "./services/care-relationship.service";
import { PatientGuardianService } from "./services/patient-guardian.service";
import { PatientService } from "./services/patient.service";
import { AppointmentStateMachineService } from "./services/appointment-state-machine.service";
import { AvailabilityController } from "./availability.controller";
import { AvailabilityRulesController } from "./availability-rules.controller";
import { AvailabilityExceptionsController } from "./availability-exceptions.controller";
import { PatientsController } from "./patients.controller";
import { AppointmentsController } from "./appointments.controller";

// M4 — AGENDA Y DISPONIBILIDAD, M5a — PACIENTES Y CITAS (núcleo).
// M5b (notificaciones, pantallas públicas de agendamiento, resto de
// M12) queda para otra sesión — ver docs/CRITERIOS_DIFERIDOS.md.
@Module({
  // forwardRef: DoctorsModule ahora importa SchedulingModule también
  // (AppointmentCancellationSuspensionAdapter, M2-RN-005) — ver el
  // comentario simétrico en doctors.module.ts.
  imports: [IdentityModule, forwardRef(() => DoctorsModule)],
  controllers: [
    AvailabilityController,
    AvailabilityRulesController,
    AvailabilityExceptionsController,
    PatientsController,
    AppointmentsController,
  ],
  providers: [
    SchedulingAuthService,
    AvailabilityRuleService,
    AvailabilityExceptionService,
    AvailabilitySlotService,
    CareRelationshipService,
    PatientGuardianService,
    PatientService,
    AppointmentStateMachineService,
  ],
  // CareRelationshipService: M8/M9/M10 (records/prescriptions/labs)
  // necesitan esto para CareRelationshipGuard (AUTH-RN-001) — mismo
  // motivo por el que IdentityModule exporta TokenService para que
  // JwtAuthGuard funcione fuera de su propio módulo.
  // AppointmentStateMachineService: ClinicalEncounterService.sign()
  // (records) llama a completeWithSignedNote() — "cuando M8 exista,
  // la ruta real a completed se vuelve la primaria" (ver el
  // comentario de completedWithoutNoteReason en schema.prisma).
  exports: [CareRelationshipService, AppointmentStateMachineService],
})
export class SchedulingModule {}
