import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { ApiException } from "../api-exception";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedRequest } from "../../modules/identity/guards/jwt-auth.guard";
import { CareRelationshipService } from "../../modules/scheduling/services/care-relationship.service";
import { DoctorProfileService } from "../../modules/doctors/services/doctor-profile.service";
import { AuditService } from "../../modules/identity/services/audit.service";
import { getRequestMeta } from "../../modules/identity/request-meta";

// Extiende AuthenticatedRequest con lo que el guard ya resolvió, para
// que los controllers/servicios detrás no vuelvan a resolver el
// médico actuante ni el paciente de la ruta.
export interface ClinicalRequest extends AuthenticatedRequest {
  actingDoctorId?: string;
  clinicalPatientId?: string;
}

// AUTH-RN-001/M8-RN-004/M8-CA-003: ningún endpoint clínico responde
// sin care_relationship activo. A diferencia de SchedulingAuthService
// (que sí deja actuar a un ASSISTANT en nombre del médico), aquí NO
// hay fallback de asistente — la matriz de permisos (spec §5.2) es
// explícita: el asistente "no puede ver notas clínicas, ni emitir
// recetas, ni ver diagnósticos". Solo el propio médico.
//
// Resuelve patientId según la forma de la ruta, probando en orden:
// params.patientId directo, o vía params.encounterId/prescriptionId/
// labOrderId (una consulta breve a la tabla correspondiente, no un
// round-trip a un servicio de dominio).
//
// Registra en audit_log SOLO el caso DENIED — es el único que ocurre
// aquí, antes de que el controller/servicio tenga oportunidad de
// auditar nada. El caso SUCCESS lo audita cada servicio, con una
// acción específica por endpoint (R3 exige patient_id, actor, IP,
// resultado en ambos casos, no que ambos casos vivan en el mismo
// lugar del código).
@Injectable()
export class CareRelationshipGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly careRelationshipService: CareRelationshipService,
    private readonly doctorProfileService: DoctorProfileService,
    private readonly auditService: AuditService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ClinicalRequest>();
    const meta = getRequestMeta(req);

    const doctor = await this.doctorProfileService.findByUserId(req.user.sub);
    if (!doctor) {
      await this.auditService.log({
        actorUserId: req.user.sub,
        action: "clinical.access",
        resourceType: "patient",
        result: "DENIED",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: { reason: "not_a_doctor" },
      });
      throw new ApiException("CARE_RELATIONSHIP_REQUIRED", "Solo un médico con vínculo activo puede acceder a este expediente.", HttpStatus.FORBIDDEN);
    }

    const patientId = await this.resolvePatientId(req);
    if (!patientId) {
      throw new ApiException("VALIDATION_ERROR", "No se pudo determinar el paciente de la solicitud.", HttpStatus.BAD_REQUEST);
    }

    const hasRelationship = await this.careRelationshipService.hasActiveRelationship(patientId, doctor.id);
    if (!hasRelationship) {
      await this.auditService.log({
        actorUserId: req.user.sub,
        actorRole: "DOCTOR",
        action: "clinical.access",
        resourceType: "patient",
        resourceId: patientId,
        patientId,
        result: "DENIED",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: { reason: "no_active_care_relationship" },
      });
      throw new ApiException(
        "CARE_RELATIONSHIP_REQUIRED",
        "No tienes un vínculo activo con este paciente. El vínculo se crea con una cita o autorización del paciente.",
        HttpStatus.FORBIDDEN
      );
    }

    // Disponible para el controller/servicio sin resolverlo de nuevo.
    req.actingDoctorId = doctor.id;
    req.clinicalPatientId = patientId;
    return true;
  }

  private async resolvePatientId(req: ClinicalRequest): Promise<string | undefined> {
    const patientIdParam = req.params.patientId;
    if (typeof patientIdParam === "string") {
      return patientIdParam;
    }
    const encounterIdParam = req.params.encounterId;
    if (typeof encounterIdParam === "string") {
      const encounter = await this.prisma.clinicalEncounter.findUnique({
        where: { id: encounterIdParam },
        select: { patientId: true },
      });
      return encounter?.patientId;
    }
    const prescriptionIdParam = req.params.prescriptionId;
    if (typeof prescriptionIdParam === "string") {
      const prescription = await this.prisma.prescription.findUnique({
        where: { id: prescriptionIdParam },
        select: { patientId: true },
      });
      return prescription?.patientId;
    }
    const labOrderIdParam = req.params.labOrderId;
    if (typeof labOrderIdParam === "string") {
      const labOrder = await this.prisma.labOrder.findUnique({
        where: { id: labOrderIdParam },
        select: { patientId: true },
      });
      return labOrder?.patientId;
    }
    return undefined;
  }
}
