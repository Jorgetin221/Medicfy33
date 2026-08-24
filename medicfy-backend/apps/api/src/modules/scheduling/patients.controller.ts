import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { patientCreateSchema, type PatientCreateInput } from "@medicfy/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { JwtAuthGuard } from "../identity/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../identity/guards/jwt-auth.guard";
import { SchedulingAuthService } from "./services/scheduling-auth.service";
import { PatientService } from "./services/patient.service";
import { PatientGuardianService } from "./services/patient-guardian.service";

// §8.1: GET/POST /patients — DOCTOR, ASSISTANT. M5a builds the
// doctor/assistant-authenticated path only (M2-CA-009); the
// unauthenticated patient-self-registration path (M5-RN-008, via the
// public booking link) is M5b's "pantallas públicas".
@ApiTags("scheduling")
@ApiBearerAuth()
@Controller("patients")
@UseGuards(JwtAuthGuard)
export class PatientsController {
  constructor(
    private readonly schedulingAuth: SchedulingAuthService,
    private readonly patientService: PatientService,
    private readonly guardianService: PatientGuardianService
  ) {}

  @Get()
  @ApiOperation({ summary: "Lista los pacientes con care_relationship activo con el médico autenticado" })
  async list(@Req() req: Request) {
    const doctor = await this.schedulingAuth.resolveActingDoctor((req as AuthenticatedRequest).user.sub);
    return this.patientService.list(doctor.id);
  }

  @Post()
  @ApiOperation({ summary: "M2-CA-009: médico/asistente crea un paciente; genera medicfy_id y care_relationship automáticamente" })
  async create(@Body(new ZodValidationPipe(patientCreateSchema)) body: PatientCreateInput, @Req() req: Request) {
    const { user } = req as AuthenticatedRequest;
    const doctor = await this.schedulingAuth.resolveActingDoctor(user.sub);
    return this.patientService.createByDoctor(doctor.id, user.sub, body);
  }

  // No en la lista explícita de endpoints de M5a, pero es la mitad
  // GET de GET/PATCH /patients/{id} (§8.1, M8) — necesaria para poder
  // probar patient_guardians y las citas de un paciente ya en M5a. La
  // mitad PATCH queda para M8 como asigna la spec.
  @Get(":id")
  @ApiOperation({ summary: "Perfil de un paciente, incluyendo tutores vigentes (revoca automáticamente si ya cumplió 18)" })
  async findOne(@Param("id") id: string) {
    const patient = await this.patientService.findById(id);
    const guardians = await this.guardianService.listActiveForPatient(patient);
    return { ...patient, guardians };
  }
}
