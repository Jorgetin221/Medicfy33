import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { shareRequestCreateSchema, type ShareRequestCreateInput } from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { DoctorVerifiedGuard } from "../identity/guards/doctor-verified.guard";
import { getRequestMeta } from "../identity/request-meta";
import { RecordShareRequestService } from "./services/record-share-request.service";

// PR-EXP-02: solo médicos con cédula VERIFICADA pueden solicitar
// (D-EXP-03) — DoctorVerifiedGuard ya existe y ya implica "es médico"
// (lanza DOCTOR_NOT_VERIFIED si no hay Doctor para este userId), así
// que no hace falta un chequeo de rol aparte.
@ApiTags("record-share")
@ApiBearerAuth()
@Controller("record-share/requests")
@UseGuards(JwtAuthGuard, DoctorVerifiedGuard)
export class RecordShareRequestsController {
  constructor(private readonly requests: RecordShareRequestService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "RE5: respuesta siempre genérica, exista o no coincidencia — ver 02-solicitud-del-medico.md" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: "Médico no verificado" })
  @ApiResponse({ status: 429, description: "RECORD_SHARE_REQUEST_LIMIT_REACHED" })
  async create(@Body(new ZodValidationPipe(shareRequestCreateSchema)) body: ShareRequestCreateInput, @Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    return this.requests.requestAccess(user.sub, body, getRequestMeta(req));
  }

  @Get("mine")
  @ApiOperation({ summary: "Bandeja 'Mis solicitudes' del médico solicitante" })
  @ApiResponse({ status: 200 })
  async listMine(@Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    return this.requests.listMine(user.sub);
  }

  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cancela una solicitud propia que siga pendiente (paciente o médico tratante)" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: "RECORD_SHARE_REQUEST_NOT_CANCELLABLE" })
  async cancel(@Param("id") id: string, @Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    await this.requests.cancel(user.sub, id, getRequestMeta(req));
    return { cancelled: true };
  }
}
