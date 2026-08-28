import { Body, Controller, Get, HttpStatus, Patch, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { IMMUTABLE_DOCTOR_FIELDS, doctorLegalFieldsUpdateSchema, doctorProfileUpdateSchema } from "@medicfy/contracts";
import { ApiException } from "../../common/api-exception";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { getRequestMeta } from "../identity/request-meta";
import { AuditService } from "../identity/services/audit.service";
import { DoctorProfileService } from "./services/doctor-profile.service";

const IMMUTABLE_FIELD_SET = new Set<string>(IMMUTABLE_DOCTOR_FIELDS);

@ApiTags("doctors")
@ApiBearerAuth()
@Controller("doctors/me")
@UseGuards(JwtAuthGuard)
export class DoctorsController {
  constructor(
    private readonly doctorProfileService: DoctorProfileService,
    private readonly auditService: AuditService
  ) {}

  @Get()
  @ApiOperation({ summary: "Perfil completo del médico autenticado (incluye precios — nunca expuesto públicamente)" })
  async me(@Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    return this.doctorProfileService.getOwnProfile(user.sub);
  }

  // Fase 6 · Prompt 45: "panel de auditoría para el médico titular:
  // quién ha visto a sus pacientes" — agrega audit_log sobre TODOS los
  // pacientes con care_relationship activo con este médico. Leer esta
  // bitácora también se audita (R3 no exceptúa leer la propia
  // bitácora).
  @Get("patient-access-log")
  @ApiOperation({ summary: "Prompt 45: quién ha accedido al expediente de mis pacientes, cuándo y desde dónde" })
  async patientAccessLog(@Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    const doctor = await this.doctorProfileService.getOwnProfile(user.sub);
    const meta = getRequestMeta(req);
    const entries = await this.auditService.listForDoctorPatients(doctor.id);
    await this.auditService.log({
      actorUserId: user.sub,
      actorRole: "DOCTOR",
      action: "doctors.patientAccessLog.read",
      resourceType: "audit_log",
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    return entries;
  }

  // M2-RN-001/M2-CA-002: the raw body is split into legal fields
  // (routed through updateLegalFields — 403 unless DRAFT/SUBMITTED/
  // REJECTED, reverts SUBMITTED/REJECTED→DRAFT) and editable fields
  // (routed through updateProfile, always allowed). Split against the
  // RAW body, not a pre-merged schema, so a legal-field key is never
  // silently stripped by the editable schema's .strict() — it's
  // either applied via the correction path or explicitly rejected.
  @Patch()
  @ApiOperation({
    summary:
      "Edita el perfil; campos legales solo en draft/submitted/rejected (revierte a draft), 403 fuera de esos estados (M2-CA-002)",
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: "DOCTOR_FIELD_IMMUTABLE" })
  async update(@Body() rawBody: Record<string, unknown>, @Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    const meta = getRequestMeta(req);
    let doctor = await this.doctorProfileService.getOwnProfile(user.sub);

    const legalBody = Object.fromEntries(Object.entries(rawBody).filter(([key]) => IMMUTABLE_FIELD_SET.has(key)));
    if (Object.keys(legalBody).length > 0) {
      const legalResult = doctorLegalFieldsUpdateSchema.safeParse(legalBody);
      if (!legalResult.success) {
        throw new ApiException("VALIDATION_ERROR", "Datos de entrada inválidos.", HttpStatus.BAD_REQUEST, {
          issues: legalResult.error.issues,
        });
      }
      doctor = await this.doctorProfileService.updateLegalFields(user.sub, doctor, legalResult.data, meta);
    }

    const editableBody = Object.fromEntries(Object.entries(rawBody).filter(([key]) => !IMMUTABLE_FIELD_SET.has(key)));
    if (Object.keys(editableBody).length > 0) {
      const result = doctorProfileUpdateSchema.safeParse(editableBody);
      if (!result.success) {
        throw new ApiException("VALIDATION_ERROR", "Datos de entrada inválidos.", HttpStatus.BAD_REQUEST, {
          issues: result.error.issues,
        });
      }
      doctor = await this.doctorProfileService.updateProfile(user.sub, result.data);
    }

    return doctor;
  }
}
