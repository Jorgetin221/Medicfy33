import { Body, Controller, HttpStatus, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { publicAppointmentCreateSchema, type PublicAppointmentCreateInput } from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { ApiException } from "../../common/api-exception";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { PatientService } from "./services/patient.service";
import { AppointmentStateMachineService } from "./services/appointment-state-machine.service";

// M5-RN-009/M5-RN-010 (spec §7, v2.3): "Book Appointment" real, desde
// el perfil público del médico. PATIENT únicamente — un DOCTOR/ADMIN
// autenticado no tiene fila `patients` propia y recibe 403, nunca
// puede colarse a agendar "como" alguien más.
//
// `patientId` NUNCA sale del cuerpo (publicAppointmentCreateSchema no
// lo tiene como campo) — se resuelve aquí, del token, antes de
// llegar al servicio. Ver el hallazgo de seguridad citado en
// appointment-state-machine.service.ts.
@ApiTags("scheduling")
@ApiBearerAuth()
@Controller("doctors/:id/public-appointments")
@UseGuards(JwtAuthGuard)
export class PublicBookingController {
  constructor(
    private readonly patientService: PatientService,
    private readonly appointments: AppointmentStateMachineService
  ) {}

  @Post()
  @ApiOperation({ summary: "M5-RN-010: agenda un espacio real a nombre del paciente autenticado; sin pasarela de pago (M6-RN-006)" })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403, description: "PATIENT_PROFILE_NOT_FOUND" })
  @ApiResponse({ status: 409, description: "SLOT_TAKEN" })
  async book(
    @Param("id") doctorId: string,
    @Body(new ZodValidationPipe(publicAppointmentCreateSchema)) body: PublicAppointmentCreateInput,
    @Req() req: Request
  ) {
    const { user } = req as AuthenticatedRequest;
    const patient = await this.patientService.findByUserId(user.sub);
    if (!patient) {
      throw new ApiException(
        "PATIENT_PROFILE_NOT_FOUND",
        "Necesitas una cuenta de paciente para agendar. Regístrate primero.",
        HttpStatus.FORBIDDEN
      );
    }
    return this.appointments.createFromPublicBooking(doctorId, patient.id, user.sub, body);
  }
}
