import { Body, Controller, Get, Headers, HttpStatus, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { Doctor } from "@prisma/client";
import {
  appointmentCancelSchema,
  appointmentCompleteSchema,
  appointmentCreateSchema,
  appointmentListQuerySchema,
  appointmentRescheduleSchema,
  type AppointmentCancelInput,
  type AppointmentCompleteInput,
  type AppointmentCreateInput,
  type AppointmentRescheduleInput,
} from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { ApiException } from "../../common/api-exception";
import { parseIdempotencyKey } from "../../common/idempotency";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { SchedulingAuthService } from "./services/scheduling-auth.service";
import { AppointmentStateMachineService } from "./services/appointment-state-machine.service";
import { TeleconsultationService } from "./services/teleconsultation.service";

const appointmentListQueryPipe = new ZodValidationPipe(appointmentListQuerySchema);

// §8.1: /appointments* — "según rol"/"participantes"/"DOCTOR". M5a
// builds the DOCTOR/ASSISTANT-authenticated surface only (front desk
// acting on the patient's behalf, including cancelling "as" the
// patient via cancelledAsRole) — a patient acting under their own
// login is M5b, paired with the public booking flow (most
// created_by_doctor patients have no User account yet to log in
// with).
@ApiTags("scheduling")
@ApiBearerAuth()
@Controller("appointments")
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(
    private readonly schedulingAuth: SchedulingAuthService,
    private readonly appointments: AppointmentStateMachineService,
    private readonly teleconsultation: TeleconsultationService
  ) {}

  @Get()
  @ApiOperation({ summary: "DOC-01: agenda de un día (America/Mexico_City); sin ?date, asume hoy" })
  @ApiQuery({ name: "date", required: false, description: "YYYY-MM-DD" })
  async list(@Query("date") date: string | undefined, @Req() req: Request) {
    const query = appointmentListQueryPipe.transform({ date });
    const doctor = await this.actingDoctor(req);
    return this.appointments.listForDoctor(doctor.id, query.date);
  }

  @Post()
  @ApiOperation({ summary: "M4-CA-001: la restricción EXCLUDE de la base de datos decide, no un chequeo previo — 409 SLOT_TAKEN si ya no está libre" })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 409, description: "SLOT_TAKEN" })
  @ApiResponse({ status: 422, description: "SLOT_TOO_SOON | OUTSIDE_BOOKING_WINDOW" })
  @ApiHeader({ name: "Idempotency-Key", required: false, description: "A-14: UUID por acción; un reintento devuelve la misma cita" })
  async create(
    @Body(new ZodValidationPipe(appointmentCreateSchema)) body: AppointmentCreateInput,
    @Headers("idempotency-key") idempotencyKeyHeader: string | undefined,
    @Req() req: Request
  ) {
    const { user } = req as AuthenticatedRequest;
    const idempotencyKey = parseIdempotencyKey(idempotencyKeyHeader);
    const doctor = await this.actingDoctor(req);
    const createdVia = doctor.userId === user.sub ? "DOCTOR_PANEL" : "ASSISTANT";
    return this.appointments.create(doctor.id, user.sub, createdVia, body, idempotencyKey);
  }

  @Get(":id")
  @ApiOperation({ summary: "Detalle de una cita, con paciente/servicio/encounter — usado por /consulta/[appointmentId]" })
  async findOne(@Param("id") id: string, @Req() req: Request) {
    await this.assertOwnedByCaller(id, req);
    return this.appointments.findByIdWithDetails(id);
  }

  // A-11: sin pasarela de pago, el consultorio registra que recibió el
  // pago de una reserva pública (pending_payment -> scheduled).
  @Get(":id/next")
  @ApiOperation({ summary: "M-27: siguiente cita confirmada del día (mismo médico), o null" })
  async next(@Param("id") id: string, @Req() req: Request) {
    const appointment = await this.assertOwnedByCaller(id, req);
    return { next: await this.appointments.findNextConfirmedSameDay(appointment) };
  }

  @Post(":id/confirm-payment")
  @ApiOperation({ summary: "pending_payment -> scheduled: el consultorio confirma que recibió el pago" })
  @ApiResponse({ status: 409, description: "APPOINTMENT_TRANSITION_INVALID" })
  async confirmPayment(@Param("id") id: string, @Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    await this.assertOwnedByCaller(id, req);
    return this.appointments.confirmPayment(id, user.sub);
  }

  @Post(":id/confirm")
  @ApiOperation({ summary: "scheduled -> confirmed" })
  @ApiResponse({ status: 409, description: "APPOINTMENT_TRANSITION_INVALID" })
  async confirm(@Param("id") id: string, @Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    await this.assertOwnedByCaller(id, req);
    return this.appointments.confirm(id, user.sub);
  }

  @Post(":id/start")
  @ApiOperation({ summary: "scheduled|confirmed -> in_progress" })
  async start(@Param("id") id: string, @Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    await this.assertOwnedByCaller(id, req);
    return this.appointments.start(id, user.sub);
  }

  @Post(":id/video-room")
  @ApiOperation({ summary: "M7 (MVP): genera/recupera el enlace de videollamada de proveedor externo de una cita en línea ya en curso" })
  @ApiResponse({ status: 409, description: "APPOINTMENT_TRANSITION_INVALID" })
  @ApiResponse({ status: 422, description: "APPOINTMENT_NOT_TELECONSULTATION" })
  async openVideoRoom(@Param("id") id: string, @Req() req: Request) {
    const appointment = await this.assertOwnedByCaller(id, req);
    return this.teleconsultation.openRoom(appointment);
  }

  @Post(":id/complete")
  @ApiOperation({ summary: "M5-RN-006: in_progress -> completed. M8 (nota firmada) no existe aún — siempre vía 'consulta sin nota' con justificación" })
  async complete(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(appointmentCompleteSchema)) body: AppointmentCompleteInput,
    @Req() req: Request
  ) {
    const { user } = req as AuthenticatedRequest;
    await this.assertOwnedByCaller(id, req);
    return this.appointments.complete(id, user.sub, body.justification);
  }

  @Post(":id/no-show")
  @ApiOperation({ summary: "scheduled|confirmed -> no_show (marcado manual; el barrido automático de 60 min es releaseExpired*/markExpiredAsNoShow)" })
  async noShow(@Param("id") id: string, @Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    await this.assertOwnedByCaller(id, req);
    return this.appointments.markNoShow(id, user.sub);
  }

  // ZodValidationPipe bound to @Body() directly, not via @UsePipes at
  // the method level, on all three handlers below — each also has
  // @Param("id"), and a method-level pipe validates every handler
  // parameter, not just @Body() (the bug already found and fixed
  // elsewhere in this codebase — repeated here once, caught by the
  // test suite, fixed).
  @Post(":id/cancel")
  @ApiOperation({ summary: "M5-RN-002/003: reembolso 100% si cancela el médico; según snapshot de política si cancela el paciente" })
  async cancel(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(appointmentCancelSchema)) body: AppointmentCancelInput,
    @Req() req: Request
  ) {
    const { user } = req as AuthenticatedRequest;
    await this.assertOwnedByCaller(id, req);
    return this.appointments.cancel(id, user.sub, body.cancelledAsRole ?? "PATIENT", body.reason);
  }

  @Post(":id/reschedule")
  @ApiOperation({ summary: "M5-RN-004: cancelación + nueva cita ligada por rescheduledFromId, máx. 2 veces" })
  @ApiResponse({ status: 422, description: "MAX_RESCHEDULES_REACHED" })
  async reschedule(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(appointmentRescheduleSchema)) body: AppointmentRescheduleInput,
    @Req() req: Request
  ) {
    const { user } = req as AuthenticatedRequest;
    await this.assertOwnedByCaller(id, req);
    return this.appointments.reschedule(id, user.sub, body.rescheduledAsRole ?? "PATIENT", body.newStartsAt);
  }

  private async actingDoctor(req: Request): Promise<Doctor> {
    const { user } = req as AuthenticatedRequest;
    return this.schedulingAuth.resolveActingDoctor(user.sub);
  }

  private async assertOwnedByCaller(appointmentId: string, req: Request) {
    const doctor = await this.actingDoctor(req);
    const appointment = await this.appointments.findById(appointmentId);
    if (appointment.doctorId !== doctor.id) {
      throw new ApiException("APPOINTMENT_NOT_FOUND", "Cita no encontrada.", HttpStatus.NOT_FOUND);
    }
    return appointment;
  }
}
